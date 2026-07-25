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

  const update: Record<string, string | null> = { provider_status: providerStatus };
  if (providerStatus === "sent") update.status = "sms_sent";
  if (providerStatus === "delivered") {
    update.status = "sms_delivered";
    update.sms_delivered_at = String(form.get("delivered") || new Date().toISOString()).slice(0, 100);
  }
  if (providerStatus === "failed") {
    update.status = "sms_retry_pending";
    update.reason = "provider_delivery_failed";
    update.next_attempt_at = new Date(Date.now() + 5 * 60_000).toISOString();
  }

  const { error } = await getSupabaseAdmin().from("missed_call_events").update(update).eq("sms_provider_id", providerId);
  if (error) console.error("[textback:telephony] delivery update failed", { providerStatus });
  return new NextResponse(null, { status: 204 });
}