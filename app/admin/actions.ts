"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearAdminSession, createAdminSession, requireAdmin, verifyAdminPassword } from "@/lib/server/admin-auth";
import { parseCompanyForm } from "@/lib/server/admin-company";
import { activationReadiness, activationStepFields, assertActivationStep } from "@/lib/server/company-activation";
import { hashCustomerPassword } from "@/lib/server/customer-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { z } from "zod";

const uuid = z.string().uuid();
const refreshCompany = (id: string) => {
  revalidatePath("/admin");
  revalidatePath(`/admin/companies/${id}`);
};

export async function loginAdmin(formData: FormData) {
  const password = String(formData.get("password") || "");
  if (!verifyAdminPassword(password)) redirect("/admin/login?error=1");
  createAdminSession();
  redirect("/admin");
}
export async function logoutAdmin() { clearAdminSession(); redirect("/admin/login"); }

export async function updateConversationStatus(formData: FormData) {
  requireAdmin();
  const id = uuid.parse(String(formData.get("id") || ""));
  const status = String(formData.get("status") || "");
  if (!["new", "open", "contacted", "closed", "blocked"].includes(status)) throw new Error("INVALID_CONVERSATION_UPDATE");
  const { data, error } = await getSupabaseAdmin().from("conversations").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("CONVERSATION_UPDATE_FAILED");
  revalidatePath("/admin");
  revalidatePath(`/admin/conversations/${id}`);
}

export async function setTextbackNumberActive(formData: FormData) {
  requireAdmin();
  const id = uuid.parse(String(formData.get("id") || ""));
  const active = String(formData.get("active")) === "true";
  const db = getSupabaseAdmin();
  const { data: company, error: readError } = await db.from("textback_numbers")
    .select(`id,${activationStepFields.join(",")}`).eq("id", id).maybeSingle();
  if (readError || !company) throw new Error("NUMBER_LOOKUP_FAILED");
  if (active && !activationReadiness(company).ready) throw new Error("ACTIVATION_REQUIREMENTS_INCOMPLETE");
  const now = new Date().toISOString();
  const { data, error } = await db.from("textback_numbers").update({
    active,
    activated_at: active ? now : null,
    updated_at: now,
  }).eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("NUMBER_UPDATE_FAILED");
  refreshCompany(id);
}

export async function setCompanyActivationStep(formData: FormData) {
  requireAdmin();
  const id = uuid.parse(String(formData.get("id") || ""));
  const step = String(formData.get("step") || "");
  const verified = String(formData.get("verified")) === "true";
  assertActivationStep(step);
  const { data, error } = await getSupabaseAdmin().from("textback_numbers").update({
    [step]: verified ? new Date().toISOString() : null,
    active: false,
    activated_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("ACTIVATION_STEP_UPDATE_FAILED");
  refreshCompany(id);
}

export async function saveCompanyActivationNotes(formData: FormData) {
  requireAdmin();
  const id = uuid.parse(String(formData.get("id") || ""));
  const activation_notes = z.string().max(2000).parse(String(formData.get("activation_notes") || "").trim()) || null;
  const { data, error } = await getSupabaseAdmin().from("textback_numbers").update({ activation_notes, updated_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("ACTIVATION_NOTES_UPDATE_FAILED");
  refreshCompany(id);
}

export async function createCompany(formData: FormData) {
  requireAdmin();
  const values = { ...parseCompanyForm(formData), active: false };
  const db = getSupabaseAdmin();
  const { data: existing, error: lookupError } = await db.from("textback_numbers").select("id").eq("provider", values.provider).eq("provider_number", values.provider_number).maybeSingle();
  if (lookupError) throw new Error("COMPANY_LOOKUP_FAILED");
  if (existing) throw new Error("TEXTBACK_NUMBER_ALREADY_EXISTS");
  const { data, error } = await db.from("textback_numbers").insert(values).select("id").single();
  if (error || !data) throw new Error("COMPANY_CREATE_FAILED");
  revalidatePath("/admin");
  redirect(`/admin/companies/${data.id}`);
}

export async function updateCompany(formData: FormData) {
  requireAdmin();
  const id = uuid.parse(String(formData.get("id") || ""));
  const parsed = parseCompanyForm(formData);
  const { active: _ignored, ...values } = parsed;
  const db = getSupabaseAdmin();
  const { data: conflict, error: lookupError } = await db.from("textback_numbers").select("id").eq("provider", values.provider).eq("provider_number", values.provider_number).neq("id", id).maybeSingle();
  if (lookupError) throw new Error("COMPANY_LOOKUP_FAILED");
  if (conflict) throw new Error("TEXTBACK_NUMBER_ALREADY_EXISTS");
  const { data, error } = await db.from("textback_numbers").update(values).eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("COMPANY_UPDATE_FAILED");
  refreshCompany(id);
}

export async function saveCustomerAccess(formData: FormData) {
  requireAdmin();
  const numberId = uuid.parse(String(formData.get("textback_number_id") || ""));
  const email = z.string().email().parse(String(formData.get("email") || "").trim().toLowerCase());
  const password = String(formData.get("password") || "");
  const active = String(formData.get("active")) === "true";
  const db = getSupabaseAdmin();
  const values: Record<string, unknown> = { textback_number_id: numberId, email, active, updated_at: new Date().toISOString() };
  if (password) values.password_hash = hashCustomerPassword(password);
  const { data: existing } = await db.from("customer_users").select("id,password_hash").eq("textback_number_id", numberId).maybeSingle();
  if (!existing && !password) throw new Error("PASSWORD_REQUIRED");
  const result = existing ? await db.from("customer_users").update(values).eq("id", existing.id) : await db.from("customer_users").insert(values);
  if (result.error) throw new Error("CUSTOMER_ACCESS_SAVE_FAILED");
  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}
