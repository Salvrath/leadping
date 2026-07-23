import "server-only";
import Stripe from "stripe";
import { z } from "zod";
import type { LeadStorage } from "../lead-storage";

let stripe: Stripe | undefined;
export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("PAYMENTS_NOT_CONFIGURED");
  return stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" });
}

export async function getPilotPriceDisplay() {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PILOT_PRICE_ID) return null;
  try {
    const price = await getStripe().prices.retrieve(process.env.STRIPE_PILOT_PRICE_ID, { expand: ["product"] });
    if (price.unit_amount == null || !price.currency) return null;
    return { amount: new Intl.NumberFormat("sv-SE", { style: "currency", currency: price.currency }).format(price.unit_amount / 100), taxBehavior: price.tax_behavior };
  } catch { return null; }
}

export async function createPilotCheckout(leadId: string, storage: LeadStorage) {
  const id = z.string().uuid().parse(leadId);
  const lead = await storage.find(id);
  if (!lead) throw new Error("LEAD_NOT_FOUND");
  const price = process.env.STRIPE_PILOT_PRICE_ID;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!price || !site) throw new Error("PAYMENTS_NOT_CONFIGURED");
  const origin = new URL(site).origin;
  const session = await getStripe().checkout.sessions.create({
    mode: "payment", customer_email: lead.email, line_items: [{ price, quantity: 1 }],
    metadata: { pilot_lead_id: id }, payment_intent_data: { metadata: { pilot_lead_id: id } },
    success_url: `${origin}/pilot/tack?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pilot/avbruten?lead_id=${id}`,
  }, { idempotencyKey: `textback-pilot-${id}` });
  if (!session.url) throw new Error("CHECKOUT_URL_MISSING");
  await storage.update(id, { status: "checkout_started", payment_status: "checkout_created", stripe_checkout_session_id: session.id });
  return session.url;
}
