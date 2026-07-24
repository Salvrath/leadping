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

export async function processStripeEvent(event: Stripe.Event, db: Db = getSupabaseAdmin()) {
  if (!await claimEvent(db, event)) return { duplicate: true };
  try {
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const session = event.data.object as Stripe.Checkout.Session;
      const id = leadId(session.metadata?.pilot_lead_id);
      const paid = event.type === "checkout.session.async_payment_succeeded" || session.payment_status === "paid";
      if (paid) {
        const paidAt = new Date().toISOString();
        await updateLead(db, id, { status: "pilot_paid", payment_status: "paid", paid_at: paidAt,
          stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null });
        const { data, error } = await db.from("pilot_leads").select("company").eq("id", id).maybeSingle();
        if (error) throw new Error("WEBHOOK_LEAD_LOOKUP_FAILED");
        if (data?.company) await notifySafely(() => notifier.payment(data.company, id, paidAt), "payment");
      }
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await updateLead(db, leadId(session.metadata?.pilot_lead_id), { payment_status: "failed" });
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await updateLead(db, leadId(session.metadata?.pilot_lead_id), { payment_status: "expired" });
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      let id = charge.metadata?.pilot_lead_id;
      if (!id && charge.payment_intent) {
        const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent.id;
        const { data, error } = await db.from("pilot_leads").select("id").eq("stripe_payment_intent_id", paymentIntent).maybeSingle();
        if (error) throw new Error("WEBHOOK_LEAD_LOOKUP_FAILED");
        id = data?.id;
      }
      await updateLead(db, leadId(id), { payment_status: "refunded", refunded_at: new Date().toISOString() });
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
