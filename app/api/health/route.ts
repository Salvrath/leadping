import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.HEALTHCHECK_SECRET || process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(request: Request) {
  const started = Date.now();
  const base = {
    service: "textback",
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "local",
  };

  if (!authorized(request)) {
    return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });
  }

  const checks: Record<string, { ok: boolean; detail?: string }> = {
    supabase_config: { ok: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) },
    telephony_config: { ok: Boolean(process.env.ELKS_API_USERNAME && process.env.ELKS_API_PASSWORD && process.env.ELKS_WEBHOOK_SECRET) },
    email_config: { ok: Boolean(process.env.RESEND_API_KEY && process.env.TEXTBACK_NOTIFICATION_EMAIL && process.env.TEXTBACK_FROM_EMAIL) },
    stripe_config: { ok: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_STANDARD_PRICE_ID && process.env.STRIPE_LAUNCH_COUPON_ID) },
    admin_config: { ok: Boolean(process.env.TEXTBACK_ADMIN_PASSWORD && process.env.TEXTBACK_ADMIN_SECRET && process.env.TEXTBACK_CUSTOMER_SESSION_SECRET) },
  };

  if (checks.supabase_config.ok) {
    try {
      const { error } = await getSupabaseAdmin().from("textback_numbers").select("id", { head: true, count: "exact" }).limit(1);
      checks.database = error ? { ok: false, detail: "query_failed" } : { ok: true };
    } catch {
      checks.database = { ok: false, detail: "connection_failed" };
    }
  } else {
    checks.database = { ok: false, detail: "not_configured" };
  }

  const ready = Object.values(checks).every((check) => check.ok);
  return NextResponse.json({ ...base, status: ready ? "ready" : "degraded", duration_ms: Date.now() - started, checks }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
