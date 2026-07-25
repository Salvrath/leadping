import { NextResponse } from "next/server";
import { recordOperationalIncident } from "@/lib/server/operations";
import { elksHangupResponse, parseElksIncomingCall, verifyElksWebhook } from "@/lib/server/telephony/elks";
import { processMissedCall } from "@/lib/server/telephony/process-missed-call";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!verifyElksWebhook(request)) {
    await recordOperationalIncident({ source: "webhook", severity: "warning", code: "ELKS_CALL_UNAUTHORIZED", summary: "Ett inkommande samtalsanrop avvisades på grund av felaktig webhook-hemlighet." });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const call = await parseElksIncomingCall(request);
    await processMissedCall(call);
    return NextResponse.json(elksHangupResponse, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    console.error("[textback:telephony] incoming call failed", { code });
    await recordOperationalIncident({ source: "telephony", severity: "critical", code, summary: "Ett inkommande vidarekopplat samtal kunde inte behandlas.", context: { route: "46elks/incoming" } });
    return NextResponse.json(elksHangupResponse, { status: 200 });
  }
}
