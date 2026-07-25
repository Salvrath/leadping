import { NextResponse } from "next/server";
import { recordOperationalIncident } from "@/lib/server/operations";
import { getStripe } from "@/lib/server/stripe";
import { processStripeEvent } from "@/lib/server/webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    await recordOperationalIncident({ source: "stripe", severity: "warning", code: "STRIPE_WEBHOOK_INVALID_REQUEST", summary: "Stripe-webhook saknade signatur eller serverhemlighet." });
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }
  try {
    const event = getStripe().webhooks.constructEvent(await request.text(), signature, process.env.STRIPE_WEBHOOK_SECRET);
    const result = await processStripeEvent(event);
    return NextResponse.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    const invalidSignature = error instanceof Error && error.message.includes("signature");
    const code = invalidSignature ? "INVALID_SIGNATURE" : error instanceof Error ? error.message : "PROCESSING_FAILED";
    console.error("[stripe-webhook] rejected", { code });
    await recordOperationalIncident({
      source: "stripe",
      severity: invalidSignature ? "warning" : "critical",
      code,
      summary: invalidSignature ? "En Stripe-webhook avvisades på grund av ogiltig signatur." : "En Stripe-webhook kunde inte behandlas.",
      context: { route: "stripe/webhook" },
    });
    return NextResponse.json({ error: "Webhook rejected" }, { status: invalidSignature ? 400 : 500 });
  }
}
