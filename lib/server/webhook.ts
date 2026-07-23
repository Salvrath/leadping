import "server-only";
import type Stripe from "stripe";
import { getSupabaseAdmin } from "./supabase";
import { notifier, notifySafely } from "./notifications";

type Db = ReturnType<typeof getSupabaseAdmin>;

async function claimEvent(db: Db, event: Stripe.Event) {
  const { error } = await db.from("stripe_webhook_events").insert({ stripe_event_id: event.id, event_type: event.type });
  if (!error) return true;
  if (error.code === "23505") {
    const { data } = await db.from("stripe_webhook_events").select("processed_at,processing_error").eq("stripe_event_id", event.id).maybeSingle();
    if (data?.processed_at || !data?.processing_error) return false;
    await db.from("stripe_webhook_events").update({ processing_error: null }).eq("stripe_event_id", event.id);
    return true;
  }
  throw new Error("WEBHOOK_EVENT_CLAIM_FAILED");
}

async function updateLead(db: Db, id: string, values: Record<string, unknown>) {
  const { error } = await db.from("pilot_leads").update(values).eq("id", id);
  if (error) throw new Error("WEBHOOK_LEAD_UPDATE_FAILED");
}

export async function processStripeEvent(event: Stripe.Event, db: Db = getSupabaseAdmin()) {
  if (!await claimEvent(db, event)) return { duplicate: true };
  try {
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const session = event.data.object as Stripe.Checkout.Session;
      const id = session.metadata?.pilot_lead_id;
      if (!id) throw new Error("WEBHOOK_METADATA_MISSING");
      const paid = event.type === "checkout.session.async_payment_succeeded" || session.payment_status === "paid";
      if (paid) {
        const paidAt = new Date().toISOString();
        await updateLead(db, id, { status: "pilot_paid", payment_status: "paid", paid_at: paidAt,
          stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null });
        const { data } = await db.from("pilot_leads").select("company").eq("id", id).maybeSingle();
        if (data?.company) await notifySafely(() => notifier.payment(data.company, id, paidAt), "payment");
      }
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!session.metadata?.pilot_lead_id) throw new Error("WEBHOOK_METADATA_MISSING");
      await updateLead(db, session.metadata.pilot_lead_id, { payment_status: "failed" });
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!session.metadata?.pilot_lead_id) throw new Error("WEBHOOK_METADATA_MISSING");
      await updateLead(db, session.metadata.pilot_lead_id, { payment_status: "expired" });
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      let id = charge.metadata?.pilot_lead_id;
      if (!id && charge.payment_intent) {
        const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent.id;
        const { data } = await db.from("pilot_leads").select("id").eq("stripe_payment_intent_id", paymentIntent).maybeSingle();
        id = data?.id;
      }
      if (!id) throw new Error("WEBHOOK_METADATA_MISSING");
      await updateLead(db, id, { payment_status: "refunded", refunded_at: new Date().toISOString() });
    }
    await db.from("stripe_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: null }).eq("stripe_event_id", event.id);
    return { duplicate: false };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "UNKNOWN";
    await db.from("stripe_webhook_events").update({ processing_error: code }).eq("stripe_event_id", event.id);
    throw error;
  }
}
