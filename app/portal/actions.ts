"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearCustomerSession, requireCustomer, setCustomerSession, verifyCustomerPassword } from "@/lib/server/customer-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export async function loginCustomer(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const db = getSupabaseAdmin();
  const { data } = await db.from("customer_users").select("id,textback_number_id,password_hash,active").eq("email", email).maybeSingle();
  if (!data?.active || !verifyCustomerPassword(password, data.password_hash)) redirect("/portal/login?error=1");
  await db.from("customer_users").update({ last_login_at: new Date().toISOString() }).eq("id", data.id);
  setCustomerSession(data.id, data.textback_number_id);
  redirect("/portal");
}

export async function logoutCustomer() { clearCustomerSession(); redirect("/portal/login"); }

export async function updateCustomerConversationStatus(formData: FormData) {
  const customer = await requireCustomer();
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !["new","open","contacted","closed"].includes(status)) throw new Error("INVALID_CONVERSATION_UPDATE");
  const { data, error } = await getSupabaseAdmin().from("conversations").update({ status, updated_at: new Date().toISOString() })
    .eq("id", id).eq("textback_number_id", customer.textback_number_id).select("id").maybeSingle();
  if (error || !data) throw new Error("CONVERSATION_UPDATE_FAILED");
  revalidatePath("/portal"); revalidatePath(`/portal/conversations/${id}`);
}

export async function updateCustomerSettings(formData: FormData) {
  const customer = await requireCustomer();
  const template = String(formData.get("sms_template") || "").trim();
  if (template.length < 10 || template.length > 1000) throw new Error("INVALID_SMS_TEMPLATE");
  const { data, error } = await getSupabaseAdmin().from("textback_numbers").update({ sms_template: template, updated_at: new Date().toISOString() })
    .eq("id", customer.textback_number_id).select("id").maybeSingle();
  if (error || !data) throw new Error("SETTINGS_UPDATE_FAILED");
  revalidatePath("/portal"); revalidatePath("/portal/settings");
}
