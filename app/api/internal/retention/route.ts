import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { auditEvent } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await getSupabaseAdmin().rpc("run_textback_retention");
  if (error) {
    console.error("[retention] failed", { code: error.code || "UNKNOWN" });
    return NextResponse.json({ error: "retention_failed" }, { status: 500 });
  }
  await auditEvent({ actor: { type: "system" }, action: "retention.completed", targetType: "data_retention_run", metadata: data as Record<string, unknown> });
  return NextResponse.json({ ok: true, result: data });
}
