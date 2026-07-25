"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clearCustomerSession, requireCustomer, setCustomerSession, verifyCustomerPassword } from "@/lib/server/customer-auth";
import { auditEvent, enforceRateLimit } from "@/lib/server/security";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { sendElksSms } from "@/lib/server/telephony/elks";

const uuid = z.string().uuid();

export async function loginCustomer(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  await enforceRateLimit({ scope: "customer-login", subject: email, limit: 5, windowSeconds: 900, blockSeconds: 1800 });
  const password = String(formData.get("password") || "");
  const db = getSupabaseAdmin();
  const { data } = await db.from("customer_users").select("id,textback_number_id,password_hash,active").eq("email", email).maybeSingle();
  if (!data?.active || !verifyCustomerPassword(password, data.password_hash)) {
    await auditEvent({ actor: { type: "system" }, action: "customer.login_failed", targetType: "customer_user", metadata: { email } });
    redirect("/portal/login?error=1");
  }
  await db.from("customer_users").update({ last_login_at: new Date().toISOString() }).eq("id", data.id);
  setCustomerSession(data.id, data.textback_number_id);
  await auditEvent({ actor: { type: "customer", id: data.id }, action: "customer.login_succeeded", targetType: "customer_user", targetId: data.id });
  redirect("/portal");
}

export async function logoutCustomer() {
  const customer = await requireCustomer();
  await auditEvent({ actor: { type: "customer", id: customer.id }, action: "customer.logout", targetType: "customer_user", targetId: customer.id });
  clearCustomerSession(); redirect("/portal/login");
}

export async function updateCustomerConversationStatus(formData: FormData) {
  const customer = await requireCustomer();
  const id = uuid.parse(String(formData.get("id") || ""));
  const status = String(formData.get("status") || "");
  if (!["new","open","contacted","closed"].includes(status)) throw new Error("INVALID_CONVERSATION_UPDATE");
  const { data, error } = await getSupabaseAdmin().from("conversations").update({ status, updated_at: new Date().toISOString() })
    .eq("id", id).eq("textback_number_id", customer.textback_number_id).select("id").maybeSingle();
  if (error || !data) throw new Error("CONVERSATION_UPDATE_FAILED");
  await auditEvent({ actor: { type: "customer", id: customer.id }, action: "conversation.status_updated", targetType: "conversation", targetId: id, metadata: { status } });
  revalidatePath("/portal"); revalidatePath(`/portal/conversations/${id}`);
}

export async function sendCustomerReply(formData: FormData) {
  const customer = await requireCustomer();
  await enforceRateLimit({ scope: "customer-sms", subject: customer.id, limit: 30, windowSeconds: 60, blockSeconds: 300 });
  const conversationId = uuid.parse(String(formData.get("conversation_id") || ""));
  const requestId = uuid.parse(String(formData.get("request_id") || ""));
  const body = String(formData.get("message") || "").trim();
  if (!body || body.length > 1600) throw new Error("INVALID_OUTBOUND_MESSAGE");

  const db = getSupabaseAdmin();
  const { data: existing, error: existingError } = await db.from("sms_messages").select("id").eq("client_request_id", requestId).maybeSingle();
  if (existingError) throw new Error("OUTBOUND_IDEMPOTENCY_LOOKUP_FAILED");
  if (existing) { revalidatePath(`/portal/conversations/${conversationId}`); return; }

  const { data: conversation, error: conversationError } = await db.from("conversations")
    .select("id,customer_number,textback_number_id,textback_numbers(provider,provider_number,active)")
    .eq("id", conversationId).eq("textback_number_id", customer.textback_number_id).maybeSingle();
  if (conversationError || !conversation) throw new Error("CONVERSATION_NOT_FOUND");
  const number = Array.isArray(conversation.textback_numbers) ? conversation.textback_numbers[0] : conversation.textback_numbers;
  if (!number?.active || number.provider !== "46elks") throw new Error("TEXTBACK_NUMBER_INACTIVE");

  const now = new Date().toISOString();
  const { data: message, error: insertError } = await db.from("sms_messages").insert({
    conversation_id: conversation.id, textback_number_id: customer.textback_number_id, provider: "46elks",
    client_request_id: requestId, direction: "outbound", sender_number: number.provider_number,
    recipient_number: conversation.customer_number, body, delivery_status: "sending",
    raw_event: { source: "customer_portal", customer_user_id: customer.id },
  }).select("id").single();
  if (insertError || !message) {
    if ((insertError as { code?: string } | null)?.code === "23505") return;
    throw new Error("OUTBOUND_MESSAGE_CREATE_FAILED");
  }

  try {
    const result = await sendElksSms({ from: number.provider_number, to: conversation.customer_number, message: body, eventId: message.id });
    await db.from("sms_messages").update({
      provider_message_id: result.providerId || null,
      delivery_status: result.status === "logged" ? "logged" : result.providerStatus || "sent",
      sms_parts: result.parts || null, sms_cost: result.cost || null, sent_at: now,
      raw_event: { source: "customer_portal", mode: result.mode, provider_status: result.providerStatus || null },
    }).eq("id", message.id).eq("textback_number_id", customer.textback_number_id);
    await db.from("conversations").update({ status: "contacted", last_message_at: now, updated_at: now })
      .eq("id", conversation.id).eq("textback_number_id", customer.textback_number_id);
    await auditEvent({ actor: { type: "customer", id: customer.id }, action: "sms.sent", targetType: "sms_message", targetId: message.id, metadata: { conversation_id: conversation.id, mode: result.mode } });
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : "UNKNOWN";
    await db.from("sms_messages").update({ delivery_status: "failed", failed_at: now, failure_reason: reason })
      .eq("id", message.id).eq("textback_number_id", customer.textback_number_id);
    await auditEvent({ actor: { type: "customer", id: customer.id }, action: "sms.failed", targetType: "sms_message", targetId: message.id, metadata: { reason } });
    revalidatePath(`/portal/conversations/${conversation.id}`);
    throw new Error("OUTBOUND_SMS_FAILED");
  }
  revalidatePath("/portal"); revalidatePath(`/portal/conversations/${conversation.id}`);
}

export async function updateCustomerSettings(formData: FormData) {
  const customer = await requireCustomer();
  const template = String(formData.get("sms_template") || "").trim();
  if (template.length < 10 || template.length > 1000) throw new Error("INVALID_SMS_TEMPLATE");
  const { data, error } = await getSupabaseAdmin().from("textback_numbers").update({ sms_template: template, updated_at: new Date().toISOString() })
    .eq("id", customer.textback_number_id).select("id").maybeSingle();
  if (error || !data) throw new Error("SETTINGS_UPDATE_FAILED");
  await auditEvent({ actor: { type: "customer", id: customer.id }, action: "company.sms_template_updated", targetType: "textback_number", targetId: customer.textback_number_id });
  revalidatePath("/portal"); revalidatePath("/portal/settings");
}
