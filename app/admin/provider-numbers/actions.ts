"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/server/admin-auth";
import { normalizePhoneNumber } from "@/lib/server/telephony/number";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { provisionReadyLead } from "@/lib/server/provisioning";
import { auditEvent } from "@/lib/server/security";

const adminActor = { type: "admin" as const, id: "internal-admin" };

export async function addProviderNumber(formData: FormData) {
  requireAdmin();
  const providerNumber = normalizePhoneNumber(String(formData.get("provider_number") || ""));
  if (!providerNumber) throw new Error("INVALID_PROVIDER_NUMBER");
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db.from("provider_number_inventory").insert({
    provider: "46elks",
    provider_number: providerNumber,
    status: "available",
    configured_at: now,
  }).select("id").single();
  if (error || !data) throw new Error((error as { code?: string } | null)?.code === "23505" ? "PROVIDER_NUMBER_ALREADY_EXISTS" : "PROVIDER_NUMBER_CREATE_FAILED");
  await auditEvent({ actor: adminActor, action: "provider_number.added", targetType: "provider_number_inventory", targetId: data.id, metadata: { provider: "46elks", provider_number: providerNumber } });

  const { data: waiting } = await db.from("pilot_leads")
    .select("id").eq("provisioning_status", "awaiting_number")
    .eq("payment_status", "payment_method_saved").not("stripe_setup_intent_id", "is", null)
    .order("created_at").limit(1).maybeSingle();
  if (waiting?.id) await provisionReadyLead(waiting.id);
  revalidatePath("/admin/provider-numbers");
  redirect("/admin/provider-numbers");
}

export async function disableProviderNumber(formData: FormData) {
  requireAdmin();
  const id = String(formData.get("id") || "");
  const { data, error } = await getSupabaseAdmin().from("provider_number_inventory")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "available").select("id").maybeSingle();
  if (error || !data) throw new Error("PROVIDER_NUMBER_DISABLE_FAILED");
  await auditEvent({ actor: adminActor, action: "provider_number.disabled", targetType: "provider_number_inventory", targetId: id });
  revalidatePath("/admin/provider-numbers");
}
