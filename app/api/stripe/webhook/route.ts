import { NextResponse } from "next/server";
import { getStripe } from "@/lib/server/stripe";
import { processStripeEvent } from "@/lib/server/webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  try {
    const event = getStripe().webhooks.constructEvent(await request.text(), signature, process.env.STRIPE_WEBHOOK_SECRET);
    const result = await processStripeEvent(event);
    return NextResponse.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    const code = error instanceof Error && error.message.includes("signature") ? "INVALID_SIGNATURE" : "PROCESSING_FAILED";
    console.error("[stripe-webhook] rejected", { code });
    return NextResponse.json({ error: "Webhook rejected" }, { status: code === "INVALID_SIGNATURE" ? 400 : 500 });
  }
}
