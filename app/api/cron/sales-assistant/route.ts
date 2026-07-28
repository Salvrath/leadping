import { NextResponse } from "next/server";
import { runSalesAssistant } from "@/lib/server/sales-assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const summary = await runSalesAssistant({ dryRun: false, source: "cron" });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("[textback:sales-assistant] scheduled run failed", error);
    return NextResponse.json({ ok: false, error: "sales_assistant_failed" }, { status: 500 });
  }
}