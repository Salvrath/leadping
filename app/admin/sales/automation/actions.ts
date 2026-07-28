"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminActionError, adminActionSuccess, type AdminActionState } from "@/lib/admin-action-state";
import { requireAdmin } from "@/lib/server/admin-auth";
import { auditEvent } from "@/lib/server/security";
import { parseSalesCsv } from "@/lib/server/sales";
import { runSalesAssistant } from "@/lib/server/sales-assistant";
import { getSupabaseAdmin } from "@/lib/server/supabase";

const adminActor = { type: "admin" as const, id: "internal-admin" };
const bool = (formData: FormData, name: string) => String(formData.get(name) || "") === "true";
const refresh = () => {
  revalidatePath("/admin/sales");
  revalidatePath("/admin/sales/import");
  revalidatePath("/admin/sales/automation");
  revalidatePath("/admin/sales/campaigns");
};

export async function importSalesLeadsAssistedWithFeedback(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  requireAdmin();
  const db = getSupabaseAdmin();
  let batchId: string | null = null;
  try {
    const pasted = String(formData.get("csv") || "").trim();
    const file = formData.get("file");
    const fileText = file instanceof File && file.size > 0 ? await file.text() : "";
    const input = pasted || fileText;
    if (!input) return adminActionError("Klistra in CSV-data eller välj en CSV-fil.");
    const parsed = parseSalesCsv(input);
    if (!parsed.rows.length) return adminActionError(parsed.rejected[0]?.reason || "Inga giltiga leads hittades.");
    if (parsed.rows.length > 500) return adminActionError("Importera högst 500 leads åt gången.");

    const source = z.string().min(2).max(100).parse(String(formData.get("source") || "admin_csv").trim());
    const sourceQuery = z.string().max(1000).parse(String(formData.get("source_query") || "").trim()) || null;
    const uniqueRows = Array.from(new Map(parsed.rows.map((row) => [row.phoneNumber, row])).values());
    const internalDuplicates = parsed.rows.length - uniqueRows.length;
    const { data: batch, error: batchError } = await db.from("sales_import_batches").insert({
      source,
      source_query: sourceQuery,
      total_rows: parsed.rows.length + parsed.rejected.length,
      rejected_count: parsed.rejected.length,
      duplicate_count: internalDuplicates,
      metadata: { file_name: file instanceof File && file.size > 0 ? file.name : null },
    }).select("id").single();
    if (batchError || !batch) throw new Error("SALES_IMPORT_BATCH_CREATE_FAILED");
    batchId = batch.id;

    const phones = uniqueRows.map((row) => row.phoneNumber);
    const [{ data: existing, error: existingError }, { data: suppressions, error: suppressionError }] = await Promise.all([
      db.from("sales_leads").select("phone_number").in("phone_number", phones),
      db.from("sales_suppressions").select("phone_number").in("phone_number", phones),
    ]);
    if (existingError || suppressionError) throw new Error("SALES_IMPORT_LOOKUP_FAILED");
    const existingPhones = new Set((existing || []).map((item) => item.phone_number));
    const suppressedPhones = new Set((suppressions || []).map((item) => item.phone_number));
    const newRows = uniqueRows.filter((row) => !existingPhones.has(row.phoneNumber));
    const values = newRows.map((row) => ({
      company_name: row.companyName,
      organization_number: row.organizationNumber,
      company_type: row.companyType,
      industry: row.industry,
      city: row.city,
      contact_name: row.contactName,
      phone_number: row.phoneNumber,
      source_url: row.sourceUrl,
      source_notes: row.sourceNotes,
      verified_at: row.verifiedAt,
      fit_score: row.fitScore,
      fit_reason: row.fitReason,
      tags: row.tags,
      import_batch_id: batch.id,
      verification_status: suppressedPhones.has(row.phoneNumber) ? "rejected" : "pending",
      verification_reasons: suppressedPhones.has(row.phoneNumber) ? ["Numret finns i spärrlistan."] : [],
      do_not_contact: suppressedPhones.has(row.phoneNumber),
      status: suppressedPhones.has(row.phoneNumber) ? "blocked" : "review",
    }));
    if (values.length) {
      const { error } = await db.from("sales_leads").insert(values);
      if (error) throw new Error("SALES_IMPORT_FAILED");
    }
    const duplicateCount = internalDuplicates + existingPhones.size;
    await db.from("sales_import_batches").update({
      status: parsed.rejected.length ? "partially_completed" : "completed",
      imported_count: values.length,
      rejected_count: parsed.rejected.length,
      duplicate_count: duplicateCount,
      completed_at: new Date().toISOString(),
    }).eq("id", batch.id);
    const summary = await runSalesAssistant({ dryRun: false, source: "import" });
    await auditEvent({ actor: adminActor, action: "sales_leads.assisted_import", targetType: "sales_import_batch", targetId: batch.id, metadata: { imported: values.length, rejected: parsed.rejected.length, duplicates: duplicateCount, ready: summary.ready } });
    refresh();
    return adminActionSuccess(`${values.length} nya leads importerades · ${duplicateCount} dubbletter · ${parsed.rejected.length} avvisade. Automatisk kontroll är klar.`);
  } catch {
    if (batchId) await db.from("sales_import_batches").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", batchId);
    return adminActionError("Importen kunde inte slutföras. Inga SMS skickades.");
  }
}

export async function runSalesAssistantWithFeedback(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  requireAdmin();
  try {
    const dryRun = String(formData.get("mode") || "simulate") !== "apply";
    const summary = await runSalesAssistant({ dryRun, source: "admin" });
    await auditEvent({
      actor: adminActor,
      action: dryRun ? "sales_assistant.simulated" : "sales_assistant.applied",
      targetType: "sales_automation_run",
      targetId: summary.runId,
      metadata: { ready: summary.ready, needs_review: summary.needsReview, cold_draft_id: summary.coldDraftId, follow_up_draft_id: summary.followUpDraftId },
    });
    refresh();
    if (dryRun) return adminActionSuccess(`Simulering klar: ${summary.ready} redo, ${summary.needsReview} behöver kontroll och ${summary.coldCandidates} kan ingå i ett utkast.`);
    const drafts = [summary.coldDraftId, summary.followUpDraftId].filter(Boolean).length;
    return adminActionSuccess(`Assisterad körning klar. ${summary.autoApproved} leads godkändes och ${drafts} kampanjutkast skapades.`);
  } catch {
    return adminActionError("Den assisterade körningen misslyckades. Inga SMS skickades.");
  }
}

export async function updateSalesAutomationSettingsWithFeedback(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  requireAdmin();
  try {
    const settings = {
      paused: bool(formData, "paused"),
      auto_approve_verified: bool(formData, "auto_approve_verified"),
      auto_create_drafts: bool(formData, "auto_create_drafts"),
      simulation_only: bool(formData, "simulation_only"),
      batch_size: z.coerce.number().int().min(1).max(50).parse(formData.get("batch_size")),
      min_draft_size: z.coerce.number().int().min(1).max(50).parse(formData.get("min_draft_size")),
      verification_max_age_days: z.coerce.number().int().min(1).max(365).parse(formData.get("verification_max_age_days")),
      follow_up_after_days: z.coerce.number().int().min(1).max(30).parse(formData.get("follow_up_after_days")),
      updated_at: new Date().toISOString(),
    };
    if (settings.min_draft_size > settings.batch_size) return adminActionError("Minsta utkaststorlek kan inte vara större än kampanjstorleken.");
    const { error } = await db.from("sales_automation_settings").update(settings).eq("id", true);
    if (error) throw new Error("SALES_AUTOMATION_SETTINGS_UPDATE_FAILED");
    await auditEvent({ actor: adminActor, action: "sales_assistant.settings_updated", targetType: "sales_automation_settings", metadata: settings });
    refresh();
    return adminActionSuccess(settings.paused ? "All utgående försäljning är pausad." : "Automationsinställningarna är sparade.");
  } catch {
    return adminActionError("Inställningarna kunde inte sparas.");
  }
}