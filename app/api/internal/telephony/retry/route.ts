import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { retryMissedCallEvent } from "@/lib/server/telephony/process-missed-call";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return secureEqual(bearer, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await getSupabaseAdmin()
    .from("missed_call_events")
    .select("id")
    .eq("status", "sms_retry_pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(25);
  if (error) return NextResponse.json({ error: "retry_lookup_failed" }, { status: 500 });
  const results = [];
  for (const row of data || []) {
    try { results.push(await retryMissedCallEvent(row.id)); }
    catch (retryError) {
      console.error("[textback:telephony] retry worker failed", { eventId: row.id, code: retryError instanceof Error ? retryError.message : "UNKNOWN" });
      results.push({ status: "worker_error", eventId: row.id });
    }
  }
  return NextResponse.json({ processed: results.length, results });
}