import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { finalizeReadySelfServiceNumber } from "@/lib/server/provisioning";
import { normalizePhoneNumber, samePhoneNumber } from "./number";
import { DEMO_SMS_MESSAGE, demoCooldownMinutes, demoDailyLimit } from "./demo-policy";
import { getSmsMode, sendElksSms } from "./elks";
import type { IncomingCall, SmsMode, TextbackNumber } from "./types";

const DEFAULT_TEMPLATE = "Hej! Vi kunde inte svara just nu. Beskriv gärna vad du behöver hjälp med, så återkommer vi så snart vi kan. / {{businessName}}";
const MAX_SMS_ATTEMPTS = 3;
const RETRY_DELAYS_MINUTES = [1, 5, 30] as const;

function dedupeMinutes(): number {
  const value = Number(process.env.TEXTBACK_DEDUPE_MINUTES || 60);
  return Number.isFinite(value) && value >= 1 && value <= 1440 ? Math.floor(value) : 60;
}

export function canProcessInactiveNumber(mode: SmsMode, onboardingTestMode = false): boolean {
  return onboardingTestMode || mode === "dryrun" || mode === "log";
}

export function renderMessage(template: string, businessName: string): string {
  return (template || DEFAULT_TEMPLATE).replaceAll("{{businessName}}", businessName).trim().slice(0, 1000);
}

function outgoingMessage(config: TextbackNumber) {
  return config.demo_mode ? DEMO_SMS_MESSAGE : renderMessage(config.sms_template, config.business_name);
}

function retryAt(attempt: number): string | null {
  if (attempt >= MAX_SMS_ATTEMPTS) return null;
  const minutes = RETRY_DELAYS_MINUTES[Math.min(attempt - 1, RETRY_DELAYS_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function createIgnoredEvent(call: IncomingCall, reason: string, textbackNumberId?: string) {
  await getSupabaseAdmin().from("missed_call_events").upsert({
    provider: call.provider, provider_call_id: call.providerCallId, textback_number_id: textbackNumberId || null,
    caller_number: call.callerNumber, destination_number: call.destinationNumber, status: "ignored", reason, raw_event: call.raw,
  }, { onConflict: "provider,provider_call_id", ignoreDuplicates: true });
}

async function demoDailyLimitReached(config: TextbackNumber) {
  if (!config.demo_mode) return false;
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count, error } = await getSupabaseAdmin().from("missed_call_events")
    .select("id", { count: "exact", head: true })
    .eq("textback_number_id", config.id)
    .in("status", ["sms_processing", "sms_logged", "sms_sent", "sms_delivered"])
    .gte("created_at", since);
  if (error) throw new Error("DEMO_LIMIT_LOOKUP_FAILED");
  return (count || 0) >= demoDailyLimit();
}

async function deliverEvent(eventId: string, config: TextbackNumber, callerNumber: string, currentAttempts = 0, modeOverride?: SmsMode) {
  const supabase = getSupabaseAdmin();
  const attempt = currentAttempts + 1;
  await supabase.from("missed_call_events").update({
    status: "sms_processing", sms_attempts: attempt, last_attempt_at: new Date().toISOString(), next_attempt_at: null, reason: null,
  }).eq("id", eventId);

  const sender = normalizePhoneNumber(config.sms_sender || config.provider_number) || config.sms_sender || "Textback";
  try {
    const sms = await sendElksSms({
      from: sender, to: callerNumber, message: outgoingMessage(config), eventId, modeOverride,
    });
    const verifiedAt = new Date().toISOString();
    await supabase.from("missed_call_events").update({
      status: sms.mode === "log" ? "sms_logged" : sms.mode === "dryrun" ? "sms_logged" : "sms_sent",
      sms_provider_id: sms.providerId || null, provider_status: sms.providerStatus || null,
      sms_parts: sms.parts ?? null, sms_cost: sms.cost ?? null, sms_sent_at: verifiedAt, next_attempt_at: null,
    }).eq("id", eventId);

    if (config.onboarding_test_mode && sms.mode === "dryrun") {
      await supabase.from("textback_numbers").update({
        forwarding_verified_at: verifiedAt, caller_id_verified_at: verifiedAt,
        outbound_sms_verified_at: verifiedAt, updated_at: verifiedAt,
      }).eq("id", config.id).eq("onboarding_test_mode", true);
      await finalizeReadySelfServiceNumber(config.id);
    }
    return { status: sms.mode === "live" ? "sms_sent" as const : "sms_logged" as const, eventId };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "unknown_sms_error";
    const nextAttemptAt = retryAt(attempt);
    await supabase.from("missed_call_events").update({
      status: nextAttemptAt ? "sms_retry_pending" : "sms_dead_letter", reason: code, next_attempt_at: nextAttemptAt,
    }).eq("id", eventId);
    return { status: nextAttemptAt ? "sms_retry_pending" as const : "sms_dead_letter" as const, eventId, reason: code };
  }
}

export async function retryMissedCallEvent(eventId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("missed_call_events")
    .select("id,status,sms_attempts,caller_number,textback_numbers(id,provider,provider_number,business_name,business_phone_numbers,sms_template,sms_sender,active,onboarding_test_mode,demo_mode)")
    .eq("id", eventId).eq("status", "sms_retry_pending").lte("next_attempt_at", new Date().toISOString()).maybeSingle();
  if (error) throw new Error("SMS_RETRY_LOOKUP_FAILED");
  if (!data || !data.caller_number || !data.textback_numbers) return { status: "not_retryable" as const };
  const config = Array.isArray(data.textback_numbers) ? data.textback_numbers[0] : data.textback_numbers;
  if (!config?.active) return { status: "not_retryable" as const };
  return deliverEvent(data.id, config as TextbackNumber, data.caller_number, data.sms_attempts || 0);
}

export async function processMissedCall(call: IncomingCall) {
  const supabase = getSupabaseAdmin();
  if (!call.destinationNumber) {
    await createIgnoredEvent(call, "invalid_destination");
    return { status: "ignored" as const, reason: "invalid_destination" };
  }
  const { data: number, error: numberError } = await supabase
    .from("textback_numbers")
    .select("id,provider,provider_number,business_name,business_phone_numbers,sms_template,sms_sender,active,onboarding_test_mode,demo_mode")
    .eq("provider", call.provider).eq("provider_number", call.destinationNumber).maybeSingle();
  if (numberError) throw new Error("TEXTBACK_NUMBER_LOOKUP_FAILED");
  if (!number) {
    await createIgnoredEvent(call, "unknown_destination");
    return { status: "ignored" as const, reason: "unknown_destination" };
  }
  const config = number as TextbackNumber;
  const onboardingDryRun = !config.active && Boolean(config.onboarding_test_mode);
  if (!config.active && !canProcessInactiveNumber(getSmsMode(), onboardingDryRun)) {
    await createIgnoredEvent(call, "inactive_destination", config.id);
    return { status: "ignored" as const, reason: "inactive_destination" };
  }
  if (!call.callerNumber) {
    await createIgnoredEvent(call, "hidden_or_invalid_caller", config.id);
    return { status: "ignored" as const, reason: "hidden_or_invalid_caller" };
  }
  if (config.business_phone_numbers.some((phone) => samePhoneNumber(phone, call.callerNumber))) {
    await createIgnoredEvent(call, "business_own_number", config.id);
    return { status: "ignored" as const, reason: "business_own_number" };
  }

  const { data: existing } = await supabase.from("missed_call_events")
    .select("id,status,sms_attempts,next_attempt_at").eq("provider", call.provider).eq("provider_call_id", call.providerCallId).maybeSingle();
  if (existing) {
    if (existing.status === "sms_retry_pending" && existing.next_attempt_at && new Date(existing.next_attempt_at) <= new Date()) {
      return deliverEvent(existing.id, config, call.callerNumber, existing.sms_attempts || 0, onboardingDryRun ? "dryrun" : undefined);
    }
    return { status: "duplicate_event" as const, eventId: existing.id };
  }

  if (await demoDailyLimitReached(config)) {
    await createIgnoredEvent(call, "demo_daily_limit", config.id);
    return { status: "ignored" as const, reason: "demo_daily_limit" };
  }

  const cooldown = config.demo_mode ? demoCooldownMinutes() : dedupeMinutes();
  const since = new Date(Date.now() - cooldown * 60_000).toISOString();
  const { data: recent, error: recentError } = await supabase.from("missed_call_events")
    .select("id").eq("textback_number_id", config.id).eq("caller_number", call.callerNumber)
    .in("status", ["sms_processing", "sms_logged", "sms_sent", "sms_delivered"]).gte("created_at", since).limit(1);
  if (recentError) throw new Error("DEDUPE_LOOKUP_FAILED");

  const status = recent?.length ? "deduplicated" : "sms_queued";
  const { data: event, error: insertError } = await supabase.from("missed_call_events").insert({
    provider: call.provider, provider_call_id: call.providerCallId, textback_number_id: config.id,
    caller_number: call.callerNumber, destination_number: call.destinationNumber, status,
    reason: recent?.length ? (config.demo_mode ? "demo_caller_cooldown" : "caller_recently_contacted") : null, raw_event: call.raw,
  }).select("id").single();
  if (insertError || !event) {
    if ((insertError as { code?: string } | null)?.code === "23505") return { status: "duplicate_event" as const };
    throw new Error("MISSED_CALL_EVENT_CREATE_FAILED");
  }
  if (recent?.length) return { status: "deduplicated" as const, eventId: event.id };
  return deliverEvent(event.id, config, call.callerNumber, 0, onboardingDryRun ? "dryrun" : undefined);
}
