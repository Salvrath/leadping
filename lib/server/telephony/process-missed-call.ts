import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { normalizePhoneNumber, samePhoneNumber } from "./number";
import { sendElksSms } from "./elks";
import type { IncomingCall, TextbackNumber } from "./types";

const DEFAULT_TEMPLATE = "Hej! Vi kunde inte svara just nu. Beskriv gärna vad du behöver hjälp med, så återkommer vi så snart vi kan. / {{businessName}}";

function dedupeMinutes(): number {
  const value = Number(process.env.TEXTBACK_DEDUPE_MINUTES || 60);
  return Number.isFinite(value) && value >= 1 && value <= 1440 ? Math.floor(value) : 60;
}

function renderMessage(template: string, businessName: string): string {
  return (template || DEFAULT_TEMPLATE).replaceAll("{{businessName}}", businessName).trim().slice(0, 1000);
}

async function createIgnoredEvent(call: IncomingCall, reason: string, textbackNumberId?: string) {
  const supabase = getSupabaseAdmin();
  await supabase.from("missed_call_events").upsert({
    provider: call.provider,
    provider_call_id: call.providerCallId,
    textback_number_id: textbackNumberId || null,
    caller_number: call.callerNumber,
    destination_number: call.destinationNumber,
    status: "ignored",
    reason,
    raw_event: call.raw,
  }, { onConflict: "provider,provider_call_id", ignoreDuplicates: true });
}

export async function processMissedCall(call: IncomingCall) {
  const supabase = getSupabaseAdmin();
  if (!call.destinationNumber) {
    await createIgnoredEvent(call, "invalid_destination");
    return { status: "ignored" as const, reason: "invalid_destination" };
  }
  const { data: number, error: numberError } = await supabase
    .from("textback_numbers")
    .select("id,provider,provider_number,business_name,business_phone_numbers,sms_template,sms_sender,active")
    .eq("provider", call.provider)
    .eq("provider_number", call.destinationNumber)
    .eq("active", true)
    .maybeSingle();
  if (numberError) throw new Error("TEXTBACK_NUMBER_LOOKUP_FAILED");
  if (!number) {
    await createIgnoredEvent(call, "unknown_destination");
    return { status: "ignored" as const, reason: "unknown_destination" };
  }
  const config = number as TextbackNumber;
  if (!call.callerNumber) {
    await createIgnoredEvent(call, "hidden_or_invalid_caller", config.id);
    return { status: "ignored" as const, reason: "hidden_or_invalid_caller" };
  }
  if (config.business_phone_numbers.some((phone) => samePhoneNumber(phone, call.callerNumber))) {
    await createIgnoredEvent(call, "business_own_number", config.id);
    return { status: "ignored" as const, reason: "business_own_number" };
  }

  const { data: existing } = await supabase
    .from("missed_call_events")
    .select("id,status,sms_provider_id")
    .eq("provider", call.provider)
    .eq("provider_call_id", call.providerCallId)
    .maybeSingle();
  if (existing) return { status: "duplicate_event" as const, eventId: existing.id };

  const since = new Date(Date.now() - dedupeMinutes() * 60_000).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from("missed_call_events")
    .select("id")
    .eq("textback_number_id", config.id)
    .eq("caller_number", call.callerNumber)
    .in("status", ["sms_queued", "sms_sent", "sms_delivered"])
    .gte("created_at", since)
    .limit(1);
  if (recentError) throw new Error("DEDUPE_LOOKUP_FAILED");

  const status = recent?.length ? "deduplicated" : "sms_queued";
  const { data: event, error: insertError } = await supabase.from("missed_call_events").insert({
    provider: call.provider,
    provider_call_id: call.providerCallId,
    textback_number_id: config.id,
    caller_number: call.callerNumber,
    destination_number: call.destinationNumber,
    status,
    reason: recent?.length ? "caller_recently_contacted" : null,
    raw_event: call.raw,
  }).select("id").single();
  if (insertError || !event) throw new Error("MISSED_CALL_EVENT_CREATE_FAILED");
  if (recent?.length) return { status: "deduplicated" as const, eventId: event.id };

  const sender = normalizePhoneNumber(config.sms_sender || config.provider_number) || config.sms_sender || "Textback";
  try {
    const sms = await sendElksSms({
      from: sender,
      to: call.callerNumber,
      message: renderMessage(config.sms_template, config.business_name),
      eventId: event.id,
    });
    await supabase.from("missed_call_events").update({
      status: sms.mode === "log" ? "sms_logged" : "sms_sent",
      sms_provider_id: sms.providerId || null,
      sms_sent_at: new Date().toISOString(),
    }).eq("id", event.id);
    return { status: sms.mode === "log" ? "sms_logged" as const : "sms_sent" as const, eventId: event.id };
  } catch (error) {
    await supabase.from("missed_call_events").update({
      status: "sms_failed",
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown_sms_error",
    }).eq("id", event.id);
    throw error;
  }
}
