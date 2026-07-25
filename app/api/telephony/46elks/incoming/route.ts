import { NextResponse } from "next/server";
import { elksHangupResponse, parseElksIncomingCall, verifyElksWebhook } from "@/lib/server/telephony/elks";
import { processMissedCall } from "@/lib/server/telephony/process-missed-call";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!verifyElksWebhook(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const call = await parseElksIncomingCall(request);
    await processMissedCall(call);
    return NextResponse.json(elksHangupResponse, { status: 200 });
  } catch (error) {
    console.error("[textback:telephony] incoming call failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
    return NextResponse.json(elksHangupResponse, { status: 200 });
  }
}
