import "server-only";
import type Stripe from "stripe";
import { getSupabaseAdmin } from "./supabase";
import { notifier, notifySafely } from "./notifications";
import { z } from "zod";

type Db = ReturnType<typeof getSupabaseAdmin>;
const leadId = (value: string | undefined) => {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new Error("WEBHOOK_METADATA_MISSING");
  return parsed.data;
};

async function claimEvent(db: Db, event: Stripe.Event) {
  const { data, error } = await db.rpc("claim_stripe_webhook_event", {
    p_event_id: event.id,
    p_event_type: event.type,
  });
  if (error || typeof data !== "boolean") throw new Error("WEBHOOK_EVENT_CLAIM_FAILED");
  return data;
}

async function updateWebhookLedger(db: Db, eventId: string, values: Record<string, unknown>) {
  const { data, error } = await db.from("stripe_webhook_events").update(values)
    .eq("stripe_event_id", eventId).select("stripe_event_id").maybeSingle();
  if (error || !data) throw new Error("WEBHOOK_LEDGER_UPDATE_FAILED");
}

async function updateLead(db: Db, id: string, values: Record<string, unknown>) {
  const { data, error } = await db.from("pilot_leads").update(values)
    .eq("id", id).select("id").maybeSingle();
  if (error) throw new Error("WEBHOOK_LEAD_UPDATE_FAILED");
  if (!data) throw new Error("WEBHOOK_LEAD_NOT_FOUND");
}

async function findLeadIdByCustomer(db: Db, customerId: string) {
  const { data, error } = await db.from("pilot_leads").select("id")
    .eq("stripe_customer_id", customerId).maybeSingle();
  if (error) throw new Error("WEBHOOK_LEAD_LOOKUP_FAILED");
  return data?.id as string | undefined;
}

function subscriptionValues(subscription: Stripe.Subscription) {
  const currentPeriodEnd = subscription.items.data.reduce((latest, item) => Math.max(latest, item.current_period_end), 0);
  return {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
  };
}

export async function processStripeEvent(event: Stripe.Event, db: Db = getSupabaseAdmin()) {
  if (!await claimEvent(db, event)) return { duplicate: true };
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const id = leadId(session.metadata?.pilot_lead_id);
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id || null;
      const paidAt = new Date().toISOString();
      await updateLead(db, id, {
        status: "subscription_active",
        payment_status: session.payment_status,
        paid_at: session.payment_status === "paid" || session.payment_status === "no_payment_required" ? paidAt : null,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
        stripe_subscription_id: subscriptionId,
        subscription_status: "active",
      });
      const { data, error } = await db.from("pilot_leads").select("company").eq("id", id).maybeSingle();
      if (error) throw new Error("WEBHOOK_LEAD_LOOKUP_FAILED");
      if (data?.company) await notifySafely(() => notifier.payment(data.company, id, paidAt), "payment");
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      const subscription = event.data.object as Stripe.Subscription;
      const metadataId = subscription.metadata?.pilot_lead_id;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      const id = metadataId ? leadId(metadataId) : leadId(await findLeadIdByCustomer(db, customerId));
      const values = subscriptionValues(subscription);
      await updateLead(db, id, {
        ...values,
        status: subscription.status === "active" || subscription.status === "trialing" ? "subscription_active" : subscription.status === "canceled" ? "subscription_canceled" : "subscription_attention",
        payment_status: subscription.status,
      });
    } else if (["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) throw new Error("WEBHOOK_CUSTOMER_MISSING");
      const id = leadId(await findLeadIdByCustomer(db, customerId));
      await updateLead(db, id, {
        payment_status: event.type === "invoice.paid" ? "paid" : "failed",
        last_invoice_status: invoice.status,
        last_invoice_id: invoice.id,
        last_invoice_at: new Date().toISOString(),
        status: event.type === "invoice.paid" ? "subscription_active" : "subscription_attention",
      });
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await updateLead(db, leadId(session.metadata?.pilot_lead_id), { payment_status: "expired" });
    }

    await updateWebhookLedger(db, event.id, { processed_at: new Date().toISOString(), processing_error: null });
    return { duplicate: false };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "UNKNOWN";
    try {
      await updateWebhookLedger(db, event.id, { processing_error: code });
    } catch (ledgerError) {
      console.error("[stripe-webhook] ledger error", {
        processingCode: code,
        ledgerCode: ledgerError instanceof Error ? ledgerError.message : "UNKNOWN",
      });
    }
    throw error;
  }
}
