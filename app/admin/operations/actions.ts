"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { z } from "zod";

export async function resolveOperationalIncident(formData: FormData) {
  requireAdmin();
  const id = z.string().uuid().parse(String(formData.get("id") || ""));
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin().from("operational_incidents")
    .update({ resolved_at: now, updated_at: now })
    .eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("INCIDENT_RESOLVE_FAILED");
  revalidatePath("/admin");
  revalidatePath("/admin/operations");
}
