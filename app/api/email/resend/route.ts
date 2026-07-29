import { NextResponse } from "next/server";
import { refreshEmailCampaignStats } from "@/lib/server/sales-email";
import { verifyResendWebhookSignature } from "@/lib/server/resend-webhook";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

type ResendEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    bounce?: { message?: string; type?: string; subType?: string };
  };
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const eventId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!eventId || !timestamp || !signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  const payload = await request.text();
  let event: ResendEvent;
  try {
    verifyResendWebhookSignature({ payload, id: eventId, timestamp, signature, secret });
    event = JSON.parse(payload) as ResendEvent;
    if (!event?.type) throw new Error("INVALID_EVENT");
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: existing } = await db.from("sales_email_events").select("id").eq("provider_event_id", eventId).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, duplicate: true });
  const providerMessageId = event.data?.email_id || null;
  const { data: recipient } = providerMessageId
    ? await db.from("sales_email_campaign_recipients").select("id,campaign_id,sales_lead_id,status,email_address").eq("provider_message_id", providerMessageId).maybeSingle()
    : { data: null };
  const { error: journalError } = await db.from("sales_email_events").insert({
    provider_event_id: eventId,
    provider_message_id: providerMessageId,
    event_type: event.type,
    sales_email_campaign_recipient_id: recipient?.id || null,
    raw_event: event,
    provider_created_at: event.created_at || null,
  });
  if (journalError) return NextResponse.json({ error: "journal_failed" }, { status: 500 });
  if (!recipient) return NextResponse.json({ ok: true, matched: false });

  const now = event.created_at || new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let suppressionReason: string | null = null;
  let leadEmailStatus: string | null = null;
  if (event.type === "email.sent") update.status = recipient.status === "queued" || recipient.status === "sending" ? "sent" : recipient.status;
  if (event.type === "email.delivered") { update.status = ["clicked", "replied"].includes(recipient.status) ? recipient.status : "delivered"; update.delivered_at = now; }
  if (event.type === "email.bounced") {
    update.status = "bounced";
    update.bounced_at = now;
    update.failure_reason = event.data?.bounce?.message?.slice(0, 500) || "Email bounced";
    suppressionReason = "bounce";
    leadEmailStatus = "bounced";
  }
  if (event.type === "email.complained") {
    update.status = "complained";
    update.failure_reason = "Spam complaint";
    suppressionReason = "complaint";
    leadEmailStatus = "complained";
  }
  if (event.type === "email.suppressed") {
    update.status = "blocked";
    update.failure_reason = "Suppressed by provider";
    suppressionReason = "provider_suppression";
    leadEmailStatus = "unsubscribed";
  }
  if (event.type === "email.failed") { update.status = "failed"; update.failure_reason = "Provider failed to send"; }
  await db.from("sales_email_campaign_recipients").update(update).eq("id", recipient.id);

  if (suppressionReason && leadEmailStatus) {
    const email = recipient.email_address.toLocaleLowerCase("en-US");
    const { data: suppression } = await db.from("sales_email_suppressions").select("id").eq("email_address", email).maybeSingle();
    if (!suppression) await db.from("sales_email_suppressions").insert({ email_address: email, reason: suppressionReason, source: "resend_webhook", sales_lead_id: recipient.sales_lead_id });
    await db.from("sales_leads").update({ email_status: leadEmailStatus, updated_at: new Date().toISOString() }).eq("id", recipient.sales_lead_id);
  }
  await refreshEmailCampaignStats(recipient.campaign_id);
  return NextResponse.json({ ok: true, matched: true });
}