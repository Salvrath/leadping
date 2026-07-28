import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { notifier, notifySafely } from "@/lib/server/notifications";
import { finalizeReadySelfServiceNumber } from "@/lib/server/provisioning";
import { processSalesInboundSms } from "@/lib/server/sales-routing";
import type { IncomingSms } from "./types";

export async function processIncomingSms(sms: IncomingSms) {
  const supabase = getSupabaseAdmin();
  if (!sms.senderNumber || !sms.destinationNumber) return { status: "ignored" as const, reason: "invalid_number" };

  const { data: number, error: numberError } = await supabase
    .from("textback_numbers").select("id,business_name,notification_email,email_notifications_enabled,demo_mode")
    .eq("provider", sms.provider).eq("provider_number", sms.destinationNumber).maybeSingle();
  if (numberError) throw new Error("TEXTBACK_NUMBER_LOOKUP_FAILED");
  if (!number) return { status: "ignored" as const, reason: "unknown_destination" };

  const now = new Date().toISOString();
  const { error: verificationError } = await supabase.from("textback_numbers")
    .update({ inbound_sms_verified_at: now, updated_at: now })
    .eq("id", number.id).is("inbound_sms_verified_at", null);
  if (verificationError) throw new Error("INBOUND_SMS_VERIFICATION_UPDATE_FAILED");

  if (number.demo_mode) {
    const salesResult = await processSalesInboundSms(sms, number.id);
    if (salesResult) {
      await finalizeReadySelfServiceNumber(number.id);
      return salesResult;
    }
  }

  const { data: existing, error: existingError } = await supabase.from("sms_messages")
    .select("id").eq("provider", sms.provider).eq("provider_message_id", sms.providerMessageId).maybeSingle();
  if (existingError) throw new Error("SMS_DUPLICATE_LOOKUP_FAILED");
  if (existing) {
    await finalizeReadySelfServiceNumber(number.id);
    return { status: "duplicate" as const, messageId: existing.id };
  }

  const [{ data: missedCall, error: callError }, { data: existingConversation, error: existingConversationError }] = await Promise.all([
    supabase.from("missed_call_events")
      .select("id,customer_replied_at").eq("textback_number_id", number.id).eq("caller_number", sms.senderNumber)
      .in("status", ["sms_logged", "sms_sent", "sms_delivered"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("conversations")
      .select("id,status").eq("textback_number_id", number.id).eq("customer_number", sms.senderNumber).maybeSingle(),
  ]);
  if (callError) throw new Error("SMS_CALL_LINK_LOOKUP_FAILED");
  if (existingConversationError) throw new Error("CONVERSATION_LOOKUP_FAILED");

  const status = existingConversation?.status === "closed" ? "open" : existingConversation?.status || "new";
  const { data: conversation, error: conversationError } = await supabase.from("conversations").upsert({
    textback_number_id: number.id, customer_number: sms.senderNumber, status,
    last_message_at: now, latest_inbound_preview: sms.message.slice(0, 200), updated_at: now,
  }, { onConflict: "textback_number_id,customer_number" }).select("id").single();
  if (conversationError || !conversation) throw new Error("CONVERSATION_UPSERT_FAILED");

  const { data: message, error: insertError } = await supabase.from("sms_messages").insert({
    conversation_id: conversation.id, missed_call_event_id: missedCall?.id || null,
    textback_number_id: number.id, provider: sms.provider, provider_message_id: sms.providerMessageId,
    direction: "inbound", sender_number: sms.senderNumber, recipient_number: sms.destinationNumber,
    body: sms.message, provider_created_at: sms.createdAt || null, raw_event: sms.raw,
  }).select("id").single();
  if (insertError || !message) {
    if ((insertError as { code?: string } | null)?.code === "23505") return { status: "duplicate" as const };
    throw new Error("SMS_MESSAGE_CREATE_FAILED");
  }

  const isNewLead = !existingConversation || Boolean(missedCall?.id && !missedCall.customer_replied_at);
  if (missedCall?.id) {
    await supabase.from("missed_call_events").update({
      customer_replied_at: now, conversation_id: conversation.id,
    }).eq("id", missedCall.id);
  }

  if (isNewLead && number.email_notifications_enabled && number.notification_email) {
    await notifySafely(() => notifier.newLead({
      email: number.notification_email,
      businessName: number.business_name,
      customerNumber: sms.senderNumber!,
      message: sms.message,
      conversationId: conversation.id,
      messageId: message.id,
    }), "new-lead");
  }

  await finalizeReadySelfServiceNumber(number.id);
  return { status: "stored" as const, messageId: message.id, conversationId: conversation.id, businessName: number.business_name, newLead: isNewLead };
}
