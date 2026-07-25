import "server-only";
import type Stripe from "stripe";
import { getSupabaseAdmin } from "./supabase";
import { notifier, notifySafely } from "./notifications";
import { z } from "zod";

type Db = ReturnType<typeof getSupabaseAdmin>;
type StripeObject = Record<string, unknown>;

const leadId = (value: unknown) => {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new Error("WEBHOOK_METADATA_MISSING");
  return parsed.data;
};
const stringId = (value: unknown) => typeof value === "string" ? value : value && typeof value === "object" && "id" in value ? String((value as { id?: unknown }).id || "") : "";
const metadataValue = (object: StripeObject, key: string) => {
  const metadata = object.metadata;
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>)[key] : undefined;
};

async function claimEvent(db: Db, event: Stripe.Event) {
  const { data, error } = await db.rpc("claim_stripe_webhook_event", { p_event_id: event.id, p_event_type: event.type });
  if (error || typeof data !== "boolean") throw new Error("WEBHOOK_EVENT_CLAIM_FAILED");
  return data;
}
async function updateWebhookLedger(db: Db, eventId: string, values: Record<string, unknown>) {
  const { data, error } = await db.from("stripe_webhook_events").update(values).eq("stripe_event_id", eventId).select("stripe_event_id").maybeSingle();
  if (error || !data) throw new Error("WEBHOOK_LEDGER_UPDATE_FAILED");
}
async function updateLead(db: Db, id: string, values: Record<string, unknown>) {
  const { data, error } = await db.from("pilot_leads").update(values).eq("id", id).select("id").maybeSingle();
  if (error) throw new Error("WEBHOOK_LEAD_UPDATE_FAILED");
  if (!data) throw new Error("WEBHOOK_LEAD_NOT_FOUND");
}
async function findLeadIdByCustomer(db: Db, customerId: string) {
  const { data, error } = await db.from("pilot_leads").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  if (error) throw new Error("WEBHOOK_LEAD_LOOKUP_FAILED");
  return data?.id as string | undefined;
}
function unixDate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null;
}
function subscriptionValues(subscription: StripeObject) {
  const items = subscription.items && typeof subscription.items === "object" && "data" in subscription.items
    ? (subscription.items as { data?: Array<Record<string, unknown>> }).data || [] : [];
  const periodEnds = items.map((item) => typeof item.current_period_end === "number" ? item.current_period_end : 0);
  const currentPeriodEnd = periodEnds.length ? Math.max(...periodEnds) : 0;
  return {
    stripe_subscription_id: String(subscription.id || ""),
    subscription_status: String(subscription.status || "unknown"),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    current_period_end: unixDate(currentPeriodEnd),
    canceled_at: unixDate(subscription.canceled_at),
  };
}

export async function processStripeEvent(event: Stripe.Event, db: Db = getSupabaseAdmin()) {
  if (!await claimEvent(db, event)) return { duplicate: true };
  try {
    const object = event.data.object as unknown as StripeObject;
    if (event.type === "checkout.session.completed") {
      const id = leadId(metadataValue(object, "pilot_lead_id"));
      const paymentStatus = String(object.payment_status || "unknown");
      const paidAt = new Date().toISOString();
      await updateLead(db, id, {
        status: "subscription_active",
        payment_status: paymentStatus,
        paid_at: ["paid", "no_payment_required"].includes(paymentStatus) ? paidAt : null,
        stripe_customer_id: stringId(object.customer) || null,
        stripe_subscription_id: stringId(object.subscription) || null,
        subscription_status: "active",
      });
      const { data, error } = await db.from("pilot_leads").select("company").eq("id", id).maybeSingle();
      if (error) throw new Error("WEBHOOK_LEAD_LOOKUP_FAILED");
      if (data?.company) await notifySafely(() => notifier.payment(data.company, id, paidAt), "payment");
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      const metadataId = metadataValue(object, "pilot_lead_id");
      const customerId = stringId(object.customer);
      const id = metadataId ? leadId(metadataId) : leadId(await findLeadIdByCustomer(db, customerId));
      const status = String(object.status || "unknown");
      await updateLead(db, id, {
        ...subscriptionValues(object),
        status: ["active", "trialing"].includes(status) ? "subscription_active" : status === "canceled" ? "subscription_canceled" : "subscription_attention",
        payment_status: status,
      });
    } else if (["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
      const customerId = stringId(object.customer);
      if (!customerId) throw new Error("WEBHOOK_CUSTOMER_MISSING");
      const id = leadId(await findLeadIdByCustomer(db, customerId));
      await updateLead(db, id, {
        payment_status: event.type === "invoice.paid" ? "paid" : "failed",
        last_invoice_status: String(object.status || "unknown"),
        last_invoice_id: String(object.id || ""),
        last_invoice_at: new Date().toISOString(),
        status: event.type === "invoice.paid" ? "subscription_active" : "subscription_attention",
      });
    } else if (event.type === "checkout.session.expired") {
      await updateLead(db, leadId(metadataValue(object, "pilot_lead_id")), { payment_status: "expired" });
    }
    await updateWebhookLedger(db, event.id, { processed_at: new Date().toISOString(), processing_error: null });
    return { duplicate: false };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "UNKNOWN";
    try { await updateWebhookLedger(db, event.id, { processing_error: code }); }
    catch (ledgerError) { console.error("[stripe-webhook] ledger error", { processingCode: code, ledgerCode: ledgerError instanceof Error ? ledgerError.message : "UNKNOWN" }); }
    throw error;
  }
}
