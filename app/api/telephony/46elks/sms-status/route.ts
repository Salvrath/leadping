import { NextResponse } from "next/server";
import { verifyElksWebhook } from "@/lib/server/telephony/elks";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!verifyElksWebhook(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await request.formData();
  const providerId = String(form.get("id") || "").slice(0, 200);
  const providerStatus = String(form.get("status") || "").toLowerCase();
  if (!providerId || !["sent", "delivered", "failed"].includes(providerStatus)) return new NextResponse(null, { status: 204 });

  const db = getSupabaseAdmin();
  const eventUpdate: Record<string, string | null> = { provider_status: providerStatus };
  if (providerStatus === "sent") eventUpdate.status = "sms_sent";
  if (providerStatus === "delivered") {
    eventUpdate.status = "sms_delivered";
    eventUpdate.sms_delivered_at = String(form.get("delivered") || new Date().toISOString()).slice(0, 100);
  }
  if (providerStatus === "failed") {
    eventUpdate.status = "sms_retry_pending";
    eventUpdate.reason = "provider_delivery_failed";
    eventUpdate.next_attempt_at = new Date(Date.now() + 5 * 60_000).toISOString();
  }

  const messageUpdate: Record<string, string | null> = { delivery_status: providerStatus };
  if (providerStatus === "sent") messageUpdate.sent_at = new Date().toISOString();
  if (providerStatus === "delivered") messageUpdate.delivered_at = String(form.get("delivered") || new Date().toISOString()).slice(0, 100);
  if (providerStatus === "failed") {
    messageUpdate.failed_at = new Date().toISOString();
    messageUpdate.failure_reason = "provider_delivery_failed";
  }

  const [{ error: eventError }, { error: messageError }, { error: salesMessageError }] = await Promise.all([
    db.from("missed_call_events").update(eventUpdate).eq("sms_provider_id", providerId),
    db.from("sms_messages").update(messageUpdate).eq("provider", "46elks").eq("provider_message_id", providerId),
    db.from("sales_messages").update(messageUpdate).eq("provider", "46elks").eq("provider_message_id", providerId),
  ]);

  const { data: recipient, error: recipientLookupError } = await db.from("sales_campaign_recipients")
    .select("id,campaign_id,status").eq("provider_message_id", providerId).maybeSingle();
  if (recipient) {
    const recipientUpdate: Record<string, string | null> = { status: providerStatus, updated_at: new Date().toISOString() };
    if (providerStatus === "delivered") recipientUpdate.delivered_at = messageUpdate.delivered_at || new Date().toISOString();
    if (providerStatus === "failed") recipientUpdate.failure_reason = "provider_delivery_failed";
    await db.from("sales_campaign_recipients").update(recipientUpdate).eq("id", recipient.id);
    if (providerStatus === "delivered" && recipient.status !== "delivered") {
      const { data: campaign } = await db.from("sales_campaigns").select("delivered_count").eq("id", recipient.campaign_id).maybeSingle();
      if (campaign) await db.from("sales_campaigns").update({ delivered_count: campaign.delivered_count + 1, updated_at: new Date().toISOString() }).eq("id", recipient.campaign_id);
    }
  }

  if (eventError || messageError || salesMessageError || recipientLookupError) console.error("[textback:telephony] delivery update failed", {
    providerStatus,
    eventError: Boolean(eventError),
    messageError: Boolean(messageError),
    salesMessageError: Boolean(salesMessageError),
    recipientLookupError: Boolean(recipientLookupError),
  });
  return new NextResponse(null, { status: 204 });
}
