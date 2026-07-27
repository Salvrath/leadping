import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { siteUrl } from "@/lib/site";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";
import { notifier, notifySafely } from "./notifications";
import { createSelfServiceSubscription, getStripe } from "./stripe";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ProvisioningResult = {
  status: "account_setup" | "awaiting_number";
  textback_number_id?: string;
  provider_number?: string;
  email?: string;
  company?: string;
};

type BillingClaim = {
  status: "claimed" | "not_ready" | "in_progress" | "already_started";
  lead_id?: string;
  stripe_customer_id?: string;
  stripe_setup_intent_id?: string;
};

export function hashOnboardingToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hasAvailableProviderNumber() {
  if (!hasSupabaseConfig(process.env)) return process.env.NODE_ENV !== "production";
  const { count, error } = await getSupabaseAdmin()
    .from("provider_number_inventory")
    .select("id", { count: "exact", head: true })
    .eq("status", "available")
    .not("configured_at", "is", null);
  if (error) {
    if ((error as { code?: string }).code === "42P01") return false;
    throw new Error("PROVIDER_INVENTORY_LOOKUP_FAILED");
  }
  return Boolean(count && count > 0);
}

export async function provisionReadyLead(leadId: string) {
  const db = getSupabaseAdmin();
  const { data: lead, error: leadError } = await db.from("pilot_leads")
    .select("id,email,company,textback_number_id,onboarding_email_sent_at,provisioning_status")
    .eq("id", leadId).maybeSingle();
  if (leadError || !lead) throw new Error("PROVISIONING_LEAD_LOOKUP_FAILED");
  if (lead.onboarding_email_sent_at && lead.textback_number_id) return { status: "already_sent" as const };

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashOnboardingToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const { data, error } = await db.rpc("reserve_textback_number_for_ready_lead", {
    p_lead_id: leadId,
    p_token_hash: tokenHash,
    p_token_expires_at: expiresAt,
  });
  if (error) throw new Error(`PROVISIONING_RESERVATION_FAILED:${String(error.message || "UNKNOWN").slice(0, 120)}`);

  const result = data as ProvisioningResult;
  if (result.status === "awaiting_number") {
    await notifySafely(() => notifier.capacity({ email: lead.email, company: lead.company, leadId }), "capacity");
    return result;
  }
  if (!result.email || !result.company || !result.provider_number || !result.textback_number_id) throw new Error("PROVISIONING_INVALID_RESPONSE");

  const setupUrl = new URL("/kom-igang", siteUrl);
  setupUrl.searchParams.set("token", rawToken);
  await notifier.onboarding({
    email: result.email,
    company: result.company,
    providerNumber: result.provider_number,
    setupUrl: setupUrl.toString(),
    leadId,
  });

  const sentAt = new Date().toISOString();
  const { data: updated, error: updateError } = await db.from("pilot_leads").update({
    onboarding_email_sent_at: sentAt,
    provisioning_status: "account_setup",
    provisioning_error: null,
    updated_at: sentAt,
  }).eq("id", leadId).select("id").maybeSingle();
  if (updateError || !updated) throw new Error("PROVISIONING_EMAIL_MARK_FAILED");
  return result;
}

function objectId(value: string | { id?: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id || "";
}

export async function syncSelfServiceSubscription(input: {
  leadId: string;
  subscriptionId: string;
  subscriptionStatus: string;
  paymentMethodId?: string;
}) {
  const db = getSupabaseAdmin();
  let paymentMethodId = input.paymentMethodId;
  if (!paymentMethodId) {
    const { data } = await db.from("pilot_leads").select("stripe_payment_method_id").eq("id", input.leadId).maybeSingle();
    paymentMethodId = data?.stripe_payment_method_id || "";
  }
  const { error } = await db.rpc("complete_self_service_billing", {
    p_lead_id: input.leadId,
    p_subscription_id: input.subscriptionId,
    p_subscription_status: input.subscriptionStatus,
    p_payment_method_id: paymentMethodId || "unknown",
  });
  if (error) throw new Error("BILLING_COMPLETION_FAILED");
}

export async function finalizeReadySelfServiceNumber(textbackNumberId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("claim_self_service_billing", { p_textback_number_id: textbackNumberId });
  if (error) throw new Error("BILLING_CLAIM_FAILED");
  const claim = data as BillingClaim;
  if (claim.status !== "claimed" || !claim.lead_id || !claim.stripe_customer_id || !claim.stripe_setup_intent_id) return claim;

  try {
    const client = getStripe();
    const setupIntent = await client.setupIntents.retrieve(claim.stripe_setup_intent_id);
    const paymentMethodId = objectId(setupIntent.payment_method as string | { id?: string } | null);
    if (setupIntent.status !== "succeeded" || !paymentMethodId) throw new Error("SETUP_INTENT_NOT_READY");

    const subscription = await createSelfServiceSubscription({
      leadId: claim.lead_id,
      customerId: claim.stripe_customer_id,
      paymentMethodId,
    });
    await syncSelfServiceSubscription({
      leadId: claim.lead_id,
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      paymentMethodId,
    });
    return { status: subscription.status, subscriptionId: subscription.id };
  } catch (billingError) {
    const code = billingError instanceof Error ? billingError.message.slice(0, 200) : "UNKNOWN";
    await db.rpc("fail_self_service_billing", { p_lead_id: claim.lead_id, p_error: code });
    console.error("[textback:billing] automatic subscription start failed", { leadId: claim.lead_id, code });
    return { status: "billing_attention", reason: code };
  }
}

export async function refreshSelfServiceSubscription(leadId: string, subscriptionId: string) {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  await syncSelfServiceSubscription({
    leadId,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    paymentMethodId: objectId(subscription.default_payment_method as string | { id?: string } | null),
  });
  return subscription.status;
}
