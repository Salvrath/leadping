import "server-only";
import Stripe from "stripe";
import { z } from "zod";
import type { LeadStorage } from "../lead-storage";

let stripe: Stripe | undefined;
export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("PAYMENTS_NOT_CONFIGURED");
  return stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-03-31.basil" });
}

const EXPECTED_STANDARD_AMOUNT = 99_500;
const EXPECTED_DISCOUNT_AMOUNT = 50_000;
const EXPECTED_CURRENCY = "sek";
const INTRO_MONTHS = 3;

export type SubscriptionPricing = {
  standardAmount: number;
  launchAmount: number;
  currency: string;
  introMonths: number;
  taxBehavior: string | null;
};

function safeSiteOrigin(site?: string) {
  if (!site) throw new Error("PAYMENTS_NOT_CONFIGURED");
  const url = new URL(site);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("PAYMENTS_NOT_CONFIGURED");
  return url.origin;
}

export async function validateSubscriptionPricing(client = getStripe()): Promise<SubscriptionPricing> {
  const priceId = process.env.STRIPE_STANDARD_PRICE_ID;
  const couponId = process.env.STRIPE_LAUNCH_COUPON_ID;
  if (!priceId || !couponId) throw new Error("PAYMENTS_NOT_CONFIGURED");
  const [price, coupon] = await Promise.all([client.prices.retrieve(priceId), client.coupons.retrieve(couponId)]);
  if (!price.active || price.type !== "recurring" || price.recurring?.interval !== "month") throw new Error("INVALID_STANDARD_PRICE");
  if (price.currency !== EXPECTED_CURRENCY || price.unit_amount !== EXPECTED_STANDARD_AMOUNT) throw new Error("INVALID_STANDARD_PRICE");
  if (!coupon.valid || coupon.currency !== EXPECTED_CURRENCY || coupon.amount_off !== EXPECTED_DISCOUNT_AMOUNT) throw new Error("INVALID_LAUNCH_COUPON");
  if (coupon.duration !== "repeating" || coupon.duration_in_months !== INTRO_MONTHS) throw new Error("INVALID_LAUNCH_COUPON");
  return { standardAmount: EXPECTED_STANDARD_AMOUNT, launchAmount: EXPECTED_STANDARD_AMOUNT - EXPECTED_DISCOUNT_AMOUNT, currency: EXPECTED_CURRENCY, introMonths: INTRO_MONTHS, taxBehavior: price.tax_behavior ?? null };
}

export async function getPilotPriceDisplay() {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_STANDARD_PRICE_ID || !process.env.STRIPE_LAUNCH_COUPON_ID) return null;
  try {
    const pricing = await validateSubscriptionPricing();
    return {
      amount: new Intl.NumberFormat("sv-SE", { style: "currency", currency: pricing.currency }).format(pricing.launchAmount / 100),
      standardAmount: new Intl.NumberFormat("sv-SE", { style: "currency", currency: pricing.currency }).format(pricing.standardAmount / 100),
      introMonths: pricing.introMonths,
      taxBehavior: pricing.taxBehavior,
    };
  } catch { return null; }
}

export async function createPilotCheckout(leadId: string, storage: LeadStorage) {
  return createPilotCheckoutWithStripe(leadId, storage, getStripe(), {
    standardPrice: process.env.STRIPE_STANDARD_PRICE_ID,
    launchCoupon: process.env.STRIPE_LAUNCH_COUPON_ID,
    site: process.env.NEXT_PUBLIC_SITE_URL,
  });
}

type CheckoutClient = Pick<Stripe, "checkout">;
type CheckoutConfig = { standardPrice?: string; launchCoupon?: string; site?: string; price?: string };

export async function createPilotCheckoutWithStripe(
  leadId: string,
  storage: LeadStorage,
  stripeClient: CheckoutClient,
  config: CheckoutConfig,
) {
  const id = z.string().uuid().parse(leadId);
  const lead = await storage.find(id);
  if (!lead) throw new Error("LEAD_NOT_FOUND");
  const standardPrice = config.standardPrice || config.price;
  const launchCoupon = config.launchCoupon;
  if (!standardPrice || !launchCoupon) throw new Error("PAYMENTS_NOT_CONFIGURED");
  const origin = safeSiteOrigin(config.site);

  const params = {
    mode: "subscription",
    customer_email: lead.email,
    client_reference_id: id,
    line_items: [{ price: standardPrice, quantity: 1 }],
    discounts: [{ coupon: launchCoupon }],
    allow_promotion_codes: false,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    automatic_tax: { enabled: true },
    metadata: { pilot_lead_id: id },
    subscription_data: { metadata: { pilot_lead_id: id } },
    consent_collection: { terms_of_service: "required" },
    custom_text: { submit: { message: "495 kr/mån i tre månader. Därefter 995 kr/mån. Ingen bindningstid. Priser exklusive moms." } },
    success_url: `${origin}/pilot/tack?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pilot/avbruten?lead_id=${id}`,
  } as unknown as Stripe.Checkout.SessionCreateParams;

  const session = await stripeClient.checkout.sessions.create(params, { idempotencyKey: `textback-subscription-checkout-${id}` });
  if (!session.url) throw new Error("CHECKOUT_URL_MISSING");
  await storage.update(id, { status: "checkout_started", payment_status: "checkout_created", stripe_checkout_session_id: session.id });
  return session.url;
}
