import "server-only";

import { classifySalesReply, suggestedSalesReply } from "@/lib/server/sales";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import type { IncomingSms } from "@/lib/server/telephony/types";

export async function matchSalesDemoCaller(phoneNumber: string) {
  const db = getSupabaseAdmin();
  const { data: lead, error } = await db.from("sales_leads")
    .select("id,company_name,phone_number,status,do_not_contact,tracking_token,outbound_count")
    .eq("phone_number", phoneNumber).maybeSingle();
  if (error) throw new Error("SALES_DEMO_MATCH_FAILED");
  if (!lead) return null;
  const now = new Date().toISOString();
  const keepStatus = ["interested", "converted", "blocked"].includes(lead.status);
  await db.from("sales_leads").update({
    demo_called_at: now,
    status: keepStatus ? lead.status : "demo_tested",
    next_follow_up_at: lead.do_not_contact ? null : now,
    updated_at: now,
  }).eq("id", lead.id);
  return lead;
}

export async function processSalesInboundSms(sms: IncomingSms, textbackNumberId: string) {
  if (!sms.senderNumber) return null;
  const db = getSupabaseAdmin();
  const { data: lead, error } = await db.from("sales_leads")
    .select("id,company_name,phone_number,status,do_not_contact,outbound_count")
    .eq("phone_number", sms.senderNumber).maybeSingle();
  if (error) throw new Error("SALES_LEAD_REPLY_LOOKUP_FAILED");
  if (!lead || lead.outbound_count < 1) return null;

  const { data: duplicate, error: duplicateError } = await db.from("sales_messages")
    .select("id").eq("provider", sms.provider).eq("provider_message_id", sms.providerMessageId).maybeSingle();
  if (duplicateError) throw new Error("SALES_REPLY_DUPLICATE_LOOKUP_FAILED");
  if (duplicate) return { status: "sales_duplicate" as const, messageId: duplicate.id, salesLeadId: lead.id };

  const classification = classifySalesReply(sms.message);
  const suggestedReply = suggestedSalesReply(classification, lead.company_name);
  const now = new Date().toISOString();
  const { count: previousReplies } = await db.from("sales_messages")
    .select("id", { count: "exact", head: true }).eq("sales_lead_id", lead.id).eq("direction", "inbound");
  const { data: message, error: insertError } = await db.from("sales_messages").insert({
    sales_lead_id: lead.id,
    textback_number_id: textbackNumberId,
    provider: sms.provider,
    provider_message_id: sms.providerMessageId,
    direction: "inbound",
    sender_number: sms.senderNumber,
    recipient_number: sms.destinationNumber!,
    body: sms.message,
    classification,
    suggested_reply: suggestedReply,
    provider_created_at: sms.createdAt || null,
    raw_event: sms.raw,
  }).select("id").single();
  if (insertError || !message) {
    if ((insertError as { code?: string } | null)?.code === "23505") return { status: "sales_duplicate" as const, salesLeadId: lead.id };
    throw new Error("SALES_REPLY_CREATE_FAILED");
  }

  const stop = classification === "stop";
  const wrong = classification === "wrong_number";
  const notInterested = classification === "not_interested";
  const block = stop || wrong || notInterested;
  const nextStatus = stop || wrong ? "blocked" : notInterested ? "not_interested" : classification === "interested" || classification === "call_requested" ? "interested" : classification === "later" ? "follow_up" : "replied";
  const nextFollowUp = classification === "later" ? new Date(Date.now() + 14 * 24 * 60 * 60_000).toISOString() : null;
  await db.from("sales_leads").update({
    status: nextStatus,
    reply_classification: classification,
    last_reply_at: now,
    next_follow_up_at: block ? null : nextFollowUp,
    do_not_contact: block,
    stop_requested_at: stop ? now : undefined,
    updated_at: now,
  }).eq("id", lead.id);

  if (block) {
    await db.from("sales_suppressions").upsert({
      phone_number: lead.phone_number,
      reason: classification,
      source: "reply",
      sales_lead_id: lead.id,
    }, { onConflict: "phone_number" });
  }

  const { data: recipient } = await db.from("sales_campaign_recipients")
    .select("id,campaign_id,status").eq("sales_lead_id", lead.id)
    .in("status", ["sent", "delivered"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recipient) {
    await db.from("sales_campaign_recipients").update({ status: "replied", replied_at: now, updated_at: now }).eq("id", recipient.id);
    if ((previousReplies || 0) === 0) {
      const { data: campaign } = await db.from("sales_campaigns").select("reply_count").eq("id", recipient.campaign_id).maybeSingle();
      if (campaign) await db.from("sales_campaigns").update({ reply_count: campaign.reply_count + 1, updated_at: now }).eq("id", recipient.campaign_id);
    }
  }

  return { status: "sales_stored" as const, messageId: message.id, salesLeadId: lead.id, classification, blocked: block };
}
