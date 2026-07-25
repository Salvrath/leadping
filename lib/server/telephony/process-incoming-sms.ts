import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import type { IncomingSms } from "./types";

export async function processIncomingSms(sms: IncomingSms) {
  const supabase = getSupabaseAdmin();
  if (!sms.senderNumber || !sms.destinationNumber) {
    return { status: "ignored" as const, reason: "invalid_number" };
  }

  const { data: number, error: numberError } = await supabase
    .from("textback_numbers")
    .select("id,business_name,active")
    .eq("provider", sms.provider)
    .eq("provider_number", sms.destinationNumber)
    .eq("active", true)
    .maybeSingle();
  if (numberError) throw new Error("TEXTBACK_NUMBER_LOOKUP_FAILED");
  if (!number) return { status: "ignored" as const, reason: "unknown_destination" };

  const { data: existing, error: existingError } = await supabase
    .from("sms_messages")
    .select("id")
    .eq("provider", sms.provider)
    .eq("provider_message_id", sms.providerMessageId)
    .maybeSingle();
  if (existingError) throw new Error("SMS_DUPLICATE_LOOKUP_FAILED");
  if (existing) return { status: "duplicate" as const, messageId: existing.id };

  const { data: missedCall, error: callError } = await supabase
    .from("missed_call_events")
    .select("id")
    .eq("textback_number_id", number.id)
    .eq("caller_number", sms.senderNumber)
    .in("status", ["sms_logged", "sms_sent", "sms_delivered"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (callError) throw new Error("SMS_CALL_LINK_LOOKUP_FAILED");

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .upsert({
      textback_number_id: number.id,
      customer_number: sms.senderNumber,
      status: "new",
      last_message_at: new Date().toISOString(),
      latest_inbound_preview: sms.message.slice(0, 200),
    }, { onConflict: "textback_number_id,customer_number" })
    .select("id")
    .single();
  if (conversationError || !conversation) throw new Error("CONVERSATION_UPSERT_FAILED");

  const { data: message, error: insertError } = await supabase
    .from("sms_messages")
    .insert({
      conversation_id: conversation.id,
      missed_call_event_id: missedCall?.id || null,
      textback_number_id: number.id,
      provider: sms.provider,
      provider_message_id: sms.providerMessageId,
      direction: "inbound",
      sender_number: sms.senderNumber,
      recipient_number: sms.destinationNumber,
      body: sms.message,
      provider_created_at: sms.createdAt || null,
      raw_event: sms.raw,
    })
    .select("id")
    .single();
  if (insertError || !message) {
    if ((insertError as { code?: string } | null)?.code === "23505") return { status: "duplicate" as const };
    throw new Error("SMS_MESSAGE_CREATE_FAILED");
  }

  if (missedCall?.id) {
    await supabase.from("missed_call_events").update({
      customer_replied_at: new Date().toISOString(),
      conversation_id: conversation.id,
    }).eq("id", missedCall.id);
  }

  return {
    status: "stored" as const,
    messageId: message.id,
    conversationId: conversation.id,
    businessName: number.business_name,
  };
}
