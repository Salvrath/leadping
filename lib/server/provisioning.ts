import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { siteUrl } from "@/lib/site";
import { getSupabaseAdmin, hasSupabaseConfig } from "./supabase";
import { notifier, notifySafely } from "./notifications";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ProvisioningResult = {
  status: "account_setup" | "awaiting_number";
  textback_number_id?: string;
  provider_number?: string;
  email?: string;
  company?: string;
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

export async function provisionPaidLead(leadId: string) {
  const db = getSupabaseAdmin();
  const { data: lead, error: leadError } = await db.from("pilot_leads")
    .select("id,email,company,textback_number_id,onboarding_email_sent_at,provisioning_status")
    .eq("id", leadId).maybeSingle();
  if (leadError || !lead) throw new Error("PROVISIONING_LEAD_LOOKUP_FAILED");
  if (lead.onboarding_email_sent_at && lead.textback_number_id) return { status: "already_sent" as const };

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashOnboardingToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const { data, error } = await db.rpc("reserve_textback_number_for_paid_lead", {
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
  if (!result.email || !result.company || !result.provider_number || !result.textback_number_id) {
    throw new Error("PROVISIONING_INVALID_RESPONSE");
  }

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
