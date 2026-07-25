import { NextResponse } from "next/server";
import { parseElksIncomingSms, verifyElksWebhook } from "@/lib/server/telephony/elks";
import { processIncomingSms } from "@/lib/server/telephony/process-incoming-sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!verifyElksWebhook(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const sms = await parseElksIncomingSms(request);
    const result = await processIncomingSms(sms);
    return NextResponse.json({ received: true, status: result.status }, { status: 200 });
  } catch (error) {
    console.error("[textback:telephony] incoming SMS failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
