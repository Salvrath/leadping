"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clearCustomerSession, isCustomerAuthConfigured, requireCustomer, setCustomerSession, verifyCustomerPassword } from "@/lib/server/customer-auth";
import { auditEvent, clearRateLimit, enforceRateLimit, isRateLimitExceededError } from "@/lib/server/security";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getSmsMode, sendElksSms } from "@/lib/server/telephony/elks";
import type { PortalActionState } from "@/lib/portal-action-state";

const uuid = z.string().uuid();

function result(status: "success" | "error", message: string): PortalActionState {
  return { status, message, completedAt: Date.now() };
}

function actionFailure(context: string, error: unknown, message: string): PortalActionState {
  console.error(`[portal] ${context}`, { code: error instanceof Error ? error.message : "UNKNOWN" });
  return result("error", message);
}

export async function loginCustomer(formData: FormData) {
  if (!isCustomerAuthConfigured()) redirect("/portal/login?error=config");

  const email = String(formData.get("email") || "").trim().toLowerCase();

  let rateLimitKey: string;
  try {
    rateLimitKey = await enforceRateLimit({ scope: "customer-login", subject: email, limit: 5, windowSeconds: 900, blockSeconds: 1800 });
  } catch (error) {
    if (isRateLimitExceededError(error)) redirect("/portal/login?error=rate-limit");
    throw error;
  }

  const password = String(formData.get("password") || "");
  const db = getSupabaseAdmin();
  const { data } = await db.from("customer_users").select("id,textback_number_id,password_hash,active").eq("email", email).maybeSingle();
  if (!data?.active || !verifyCustomerPassword(password, data.password_hash)) {
    await auditEvent({ actor: { type: "system" }, action: "customer.login_failed", targetType: "customer_user", metadata: { email } });
    redirect("/portal/login?error=1");
  }

  await clearRateLimit(rateLimitKey);
  setCustomerSession(data.id, data.textback_number_id);
  await db.from("customer_users").update({ last_login_at: new Date().toISOString() }).eq("id", data.id);
  await auditEvent({ actor: { type: "customer", id: data.id }, action: "customer.login_succeeded", targetType: "customer_user", targetId: data.id });
  redirect("/portal");
}

export async function logoutCustomer() {
  const customer = await requireCustomer();
  await auditEvent({ actor: { type: "customer", id: customer.id }, action: "customer.logout", targetType: "customer_user", targetId: customer.id });
  clearCustomerSession();
  redirect("/portal/login");
}

export async function updateCustomerConversationStatus(_previousState: PortalActionState, formData: FormData): Promise<PortalActionState> {
  const customer = await requireCustomer();
  const parsedId = uuid.safeParse(String(formData.get("id") || ""));
  const status = String(formData.get("status") || "");
  if (!parsedId.success || !["new", "open", "contacted", "closed"].includes(status)) {
    return result("error", "Statusen kunde inte sparas.");
  }

  try {
    const { data, error } = await getSupabaseAdmin().from("conversations").update({ status, updated_at: new Date().toISOString() })
      .eq("id", parsedId.data).eq("textback_number_id", customer.textback_number_id).select("id").maybeSingle();
    if (error || !data) throw new Error("CONVERSATION_UPDATE_FAILED");
    await auditEvent({ actor: { type: "customer", id: customer.id }, action: "conversation.status_updated", targetType: "conversation", targetId: parsedId.data, metadata: { status } });
    revalidatePath("/portal");
    revalidatePath(`/portal/conversations/${parsedId.data}`);
    return result("success", "Status sparad.");
  } catch (error) {
    return actionFailure("conversation status update failed", error, "Statusen kunde inte sparas. Försök igen.");
  }
}

export async function sendCustomerReply(_previousState: PortalActionState, formData: FormData): Promise<PortalActionState> {
  const customer = await requireCustomer();
  const parsedConversationId = uuid.safeParse(String(formData.get("conversation_id") || ""));
  const parsedRequestId = uuid.safeParse(String(formData.get("request_id") || ""));
  const body = String(formData.get("message") || "").trim();

  if (!parsedConversationId.success || !parsedRequestId.success || !body || body.length > 1600) {
    return result("error", "Kontrollera meddelandet och försök igen.");
  }
  const conversationId = parsedConversationId.data;
  const requestId = parsedRequestId.data;

  try {
    await enforceRateLimit({ scope: "customer-sms", subject: customer.id, limit: 30, windowSeconds: 60, blockSeconds: 300 });
  } catch (error) {
    if (isRateLimitExceededError(error)) return result("error", "För många SMS-försök. Vänta fem minuter och försök igen.");
    return actionFailure("sms rate limit check failed", error, "SMS:et kunde inte skickas. Försök igen.");
  }

  const db = getSupabaseAdmin();
  try {
    const { data: existing, error: existingError } = await db.from("sms_messages").select("id").eq("client_request_id", requestId).maybeSingle();
    if (existingError) throw new Error("OUTBOUND_IDEMPOTENCY_LOOKUP_FAILED");
    if (existing) return result("success", "SMS är redan skickat.");

    const { data: conversation, error: conversationError } = await db.from("conversations")
      .select("id,customer_number,status,textback_number_id,textback_numbers(provider,provider_number,active)")
      .eq("id", conversationId).eq("textback_number_id", customer.textback_number_id).maybeSingle();
    if (conversationError || !conversation) throw new Error("CONVERSATION_NOT_FOUND");
    const number = Array.isArray(conversation.textback_numbers) ? conversation.textback_numbers[0] : conversation.textback_numbers;
    const smsMode = getSmsMode();
    if (!number || number.provider !== "46elks") throw new Error("TEXTBACK_PROVIDER_UNSUPPORTED");
    if (!number.active && smsMode === "live") return result("error", "Tjänsten är pausad och kan inte skicka SMS just nu.");

    const now = new Date().toISOString();
    const { data: message, error: insertError } = await db.from("sms_messages").insert({
      conversation_id: conversation.id,
      textback_number_id: customer.textback_number_id,
      provider: "46elks",
      client_request_id: requestId,
      direction: "outbound",
      sender_number: number.provider_number,
      recipient_number: conversation.customer_number,
      body,
      delivery_status: "sending",
      raw_event: { source: "customer_portal", customer_user_id: customer.id, mode: smsMode },
    }).select("id").single();
    if (insertError || !message) {
      if ((insertError as { code?: string } | null)?.code === "23505") return result("success", "SMS är redan skickat.");
      throw new Error("OUTBOUND_MESSAGE_CREATE_FAILED");
    }

    try {
      const sms = await sendElksSms({ from: number.provider_number, to: conversation.customer_number, message: body, eventId: message.id });
      await db.from("sms_messages").update({
        provider_message_id: sms.providerId || null,
        delivery_status: sms.status === "logged" ? "logged" : sms.providerStatus || "sent",
        sms_parts: sms.parts || null,
        sms_cost: sms.cost || null,
        sent_at: now,
        raw_event: { source: "customer_portal", mode: sms.mode, provider_status: sms.providerStatus || null },
      }).eq("id", message.id).eq("textback_number_id", customer.textback_number_id);

      const conversationUpdate: Record<string, unknown> = { last_message_at: now, updated_at: now };
      if (sms.mode === "live") conversationUpdate.status = "contacted";
      await db.from("conversations").update(conversationUpdate)
        .eq("id", conversation.id).eq("textback_number_id", customer.textback_number_id);

      if (sms.mode === "dryrun" || sms.mode === "live") {
        await db.from("textback_numbers")
          .update({ outbound_sms_verified_at: now, updated_at: now })
          .eq("id", customer.textback_number_id)
          .is("outbound_sms_verified_at", null);
      }

      await auditEvent({ actor: { type: "customer", id: customer.id }, action: "sms.sent", targetType: "sms_message", targetId: message.id, metadata: { conversation_id: conversation.id, mode: sms.mode } });
      revalidatePath("/portal");
      revalidatePath(`/portal/conversations/${conversation.id}`);
      return result("success", sms.mode === "dryrun" ? "SMS-testet är klart." : "SMS skickat.");
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 200) : "UNKNOWN";
      await db.from("sms_messages").update({ delivery_status: "failed", failed_at: now, failure_reason: reason })
        .eq("id", message.id).eq("textback_number_id", customer.textback_number_id);
      await auditEvent({ actor: { type: "customer", id: customer.id }, action: "sms.failed", targetType: "sms_message", targetId: message.id, metadata: { reason } });
      revalidatePath(`/portal/conversations/${conversation.id}`);
      return actionFailure("outbound sms failed", error, "SMS:et kunde inte skickas. Försök igen.");
    }
  } catch (error) {
    return actionFailure("customer reply failed", error, "SMS:et kunde inte skickas. Försök igen.");
  }
}

export async function updateCustomerSettings(_previousState: PortalActionState, formData: FormData): Promise<PortalActionState> {
  const customer = await requireCustomer();
  const template = String(formData.get("sms_template") || "").trim();
  const notificationEmail = String(formData.get("notification_email") || "").trim().toLowerCase();
  const emailNotificationsEnabled = formData.get("email_notifications_enabled") === "on";
  if (template.length < 10 || template.length > 1000) return result("error", "SMS-mallen måste innehålla mellan 10 och 1 000 tecken.");
  if (notificationEmail && !z.string().email().max(320).safeParse(notificationEmail).success) return result("error", "Ange en giltig e-postadress.");
  if (emailNotificationsEnabled && !notificationEmail) return result("error", "Ange en e-postadress för att aktivera notiser.");

  try {
    const { data, error } = await getSupabaseAdmin().from("textback_numbers").update({
      sms_template: template,
      notification_email: notificationEmail || null,
      email_notifications_enabled: emailNotificationsEnabled,
      updated_at: new Date().toISOString(),
    }).eq("id", customer.textback_number_id).select("id").maybeSingle();
    if (error || !data) throw new Error("SETTINGS_UPDATE_FAILED");
    await auditEvent({
      actor: { type: "customer", id: customer.id },
      action: "company.settings_updated",
      targetType: "textback_number",
      targetId: customer.textback_number_id,
      metadata: { email_notifications_enabled: emailNotificationsEnabled },
    });
    revalidatePath("/portal");
    revalidatePath("/portal/settings");
    return result("success", "Inställningarna är sparade.");
  } catch (error) {
    return actionFailure("settings update failed", error, "Inställningarna kunde inte sparas. Försök igen.");
  }
}
