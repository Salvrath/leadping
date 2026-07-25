"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearAdminSession, createAdminSession, requireAdmin, verifyAdminPassword } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";

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
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !["new", "open", "contacted", "closed", "blocked"].includes(status)) throw new Error("INVALID_CONVERSATION_UPDATE");
  const { error } = await getSupabaseAdmin().from("conversations").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("CONVERSATION_UPDATE_FAILED");
  revalidatePath("/admin");
  revalidatePath(`/admin/conversations/${id}`);
}

export async function setTextbackNumberActive(formData: FormData) {
  requireAdmin();
  const id = String(formData.get("id") || "");
  const active = String(formData.get("active")) === "true";
  if (!id) throw new Error("INVALID_NUMBER_UPDATE");
  const { error } = await getSupabaseAdmin().from("textback_numbers").update({ active }).eq("id", id);
  if (error) throw new Error("NUMBER_UPDATE_FAILED");
  revalidatePath("/admin");
}
