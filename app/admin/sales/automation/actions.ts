"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminActionError, adminActionSuccess, type AdminActionState } from "@/lib/admin-action-state";
import { requireAdmin } from "@/lib/server/admin-auth";
import { auditEvent } from "@/lib/server/security";
import { runSalesAssistant } from "@/lib/server/sales-assistant";
import { getSupabaseAdmin } from "@/lib/server/supabase";

const adminActor = { type: "admin" as const, id: "internal-admin" };
const bool = (formData: FormData, name: string) => String(formData.get(name) || "") === "true";
const refresh = () => {
  revalidatePath("/admin/sales");
  revalidatePath("/admin/sales/automation");
  revalidatePath("/admin/sales/campaigns");
};

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
    const { error } = await getSupabaseAdmin().from("sales_automation_settings").update(settings).eq("id", true);
    if (error) throw new Error("SALES_AUTOMATION_SETTINGS_UPDATE_FAILED");
    await auditEvent({ actor: adminActor, action: "sales_assistant.settings_updated", targetType: "sales_automation_settings", metadata: settings });
    refresh();
    return adminActionSuccess(settings.paused ? "All utgående försäljning är pausad." : "Automationsinställningarna är sparade.");
  } catch {
    return adminActionError("Inställningarna kunde inte sparas.");
  }
}