"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearAdminSession, createAdminSession, requireAdmin, verifyAdminPassword } from "@/lib/server/admin-auth";
import { parseCompanyForm } from "@/lib/server/admin-company";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { z } from "zod";

const uuid = z.string().uuid();

export async function loginAdmin(formData: FormData) {
  const password = String(formData.get("password") || "");
  if (!verifyAdminPassword(password)) redirect("/admin/login?error=1");
  createAdminSession();
  redirect("/admin");
}

export async function logoutAdmin() {
  clearAdminSession();
  redirect("/admin/login");
}

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
  const { data, error } = await getSupabaseAdmin().from("textback_numbers").update({ active, updated_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("NUMBER_UPDATE_FAILED");
  revalidatePath("/admin");
  revalidatePath(`/admin/companies/${id}`);
}

export async function createCompany(formData: FormData) {
  requireAdmin();
  const values = parseCompanyForm(formData);
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
  const values = parseCompanyForm(formData);
  const db = getSupabaseAdmin();
  const { data: conflict, error: lookupError } = await db.from("textback_numbers").select("id").eq("provider", values.provider).eq("provider_number", values.provider_number).neq("id", id).maybeSingle();
  if (lookupError) throw new Error("COMPANY_LOOKUP_FAILED");
  if (conflict) throw new Error("TEXTBACK_NUMBER_ALREADY_EXISTS");
  const { data, error } = await db.from("textback_numbers").update(values).eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("COMPANY_UPDATE_FAILED");
  revalidatePath("/admin");
  revalidatePath(`/admin/companies/${id}`);
}
