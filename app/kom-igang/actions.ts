"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashCustomerPassword, setCustomerSession } from "@/lib/server/customer-auth";
import { hashOnboardingToken } from "@/lib/server/provisioning";
import { getSupabaseAdmin } from "@/lib/server/supabase";

const tokenSchema = z.string().min(32).max(200);

export async function completeOnboarding(formData: FormData) {
  const rawToken = tokenSchema.parse(String(formData.get("token") || ""));
  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("password_confirmation") || "");
  const target = `/kom-igang?token=${encodeURIComponent(rawToken)}`;
  if (password !== confirmation) redirect(`${target}&error=mismatch`);

  let passwordHash: string;
  try { passwordHash = hashCustomerPassword(password); }
  catch { redirect(`${target}&error=password`); }

  const { data, error } = await getSupabaseAdmin().rpc("complete_customer_onboarding", {
    p_token_hash: hashOnboardingToken(rawToken),
    p_password_hash: passwordHash!,
  });
  if (error || !data) {
    const code = String(error?.message || "");
    if (code.includes("CUSTOMER_EMAIL_ALREADY_EXISTS")) redirect(`${target}&error=email`);
    redirect(`${target}&error=invalid`);
  }

  const result = data as { user_id?: string; textback_number_id?: string };
  if (!result.user_id || !result.textback_number_id) redirect(`${target}&error=invalid`);
  setCustomerSession(result.user_id, result.textback_number_id);
  redirect("/portal/onboarding");
}
