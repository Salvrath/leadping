"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin-auth";
import { auditEvent } from "@/lib/server/security";
import { getSupabaseAdmin } from "@/lib/server/supabase";

const uuid = z.string().uuid();
const requestType = z.enum(["access","correction","deletion","restriction","objection","portability"]);
const requestStatus = z.enum(["open","identity_verification","in_progress","completed","rejected"]);

export async function createPrivacyRequest(formData: FormData) {
  requireAdmin();
  const values = {
    request_type: requestType.parse(String(formData.get("request_type") || "")),
    textback_number_id: String(formData.get("textback_number_id") || "") || null,
    subject_phone: String(formData.get("subject_phone") || "").trim() || null,
    subject_email: String(formData.get("subject_email") || "").trim().toLowerCase() || null,
    requester_name: String(formData.get("requester_name") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  };
  if (!values.subject_phone && !values.subject_email) throw new Error("PRIVACY_SUBJECT_REQUIRED");
  if (values.textback_number_id) uuid.parse(values.textback_number_id);
  if (values.subject_email) z.string().email().parse(values.subject_email);
  if (values.notes && values.notes.length > 4000) throw new Error("PRIVACY_NOTES_TOO_LONG");
  const { data, error } = await getSupabaseAdmin().from("privacy_requests").insert(values).select("id").single();
  if (error || !data) throw new Error("PRIVACY_REQUEST_CREATE_FAILED");
  await auditEvent({ actor: { type: "admin", id: "internal-admin" }, action: "privacy_request.created", targetType: "privacy_request", targetId: data.id, metadata: { request_type: values.request_type, company_id: values.textback_number_id } });
  revalidatePath("/admin/data");
}

export async function updatePrivacyRequest(formData: FormData) {
  requireAdmin();
  const id = uuid.parse(String(formData.get("id") || ""));
  const status = requestStatus.parse(String(formData.get("status") || ""));
  const notes = String(formData.get("notes") || "").trim() || null;
  if (notes && notes.length > 4000) throw new Error("PRIVACY_NOTES_TOO_LONG");
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin().from("privacy_requests").update({
    status,
    notes,
    completed_at: ["completed","rejected"].includes(status) ? now : null,
    updated_at: now,
  }).eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("PRIVACY_REQUEST_UPDATE_FAILED");
  await auditEvent({ actor: { type: "admin", id: "internal-admin" }, action: "privacy_request.updated", targetType: "privacy_request", targetId: id, metadata: { status } });
  revalidatePath("/admin/data");
}

export async function runRetentionNow() {
  requireAdmin();
  const { data, error } = await getSupabaseAdmin().rpc("run_textback_retention");
  if (error) throw new Error("RETENTION_RUN_FAILED");
  await auditEvent({ actor: { type: "admin", id: "internal-admin" }, action: "retention.completed", targetType: "data_retention_run", metadata: data as Record<string, unknown> });
  revalidatePath("/admin/data");
}
