"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminActionError, adminActionSuccess, type AdminActionState } from "@/lib/admin-action-state";
import { salesLeadStatuses } from "@/lib/sales";
import { requireAdmin } from "@/lib/server/admin-auth";
import { auditEvent } from "@/lib/server/security";
import {
  estimatedSmsCostOre,
  estimateSmsParts,
  getSalesDemoNumber,
  isSalesSendWindow,
  parseSalesCsv,
  remainingSalesDailyCapacity,
  renderSalesMessage,
  salesBatchLimit,
} from "@/lib/server/sales";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { sendElksSms } from "@/lib/server/telephony/elks";

const uuid = z.string().uuid();
const adminActor = { type: "admin" as const, id: "internal-admin" };
const refreshSales = () => {
  revalidatePath("/admin");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/sales/inbox");
};

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const messages: Record<string, string> = {
    SALES_DEMO_NUMBER_UNAVAILABLE: "Det finns inget aktivt demonummer.",
    SALES_SEND_WINDOW_CLOSED: "Utskick kan göras vardagar klockan 08–18.",
    SALES_DAILY_LIMIT_REACHED: "Dagens utskicksgräns är nådd.",
    SALES_CAMPAIGN_EMPTY: "Kampanjen saknar mottagare.",
    SALES_LEAD_BLOCKED: "Kontakten är spärrad från fler utskick.",
    SALES_REPLY_EMPTY: "Skriv ett meddelande först.",
  };
  return messages[code] || "Åtgärden kunde inte genomföras. Kontrollera uppgifterna och försök igen.";
}

export async function importSalesLeadsWithFeedback(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  requireAdmin();
  try {
    const pasted = String(formData.get("csv") || "").trim();
    const file = formData.get("file");
    const fileText = file instanceof File && file.size > 0 ? await file.text() : "";
    const input = pasted || fileText;
    if (!input) return adminActionError("Klistra in CSV-data eller välj en CSV-fil.");
    const parsed = parseSalesCsv(input);
    if (!parsed.rows.length) return adminActionError(parsed.rejected[0]?.reason || "Inga giltiga leads hittades.");
    if (parsed.rows.length > 500) return adminActionError("Importera högst 500 leads åt gången.");

    const uniqueRows = Array.from(new Map(parsed.rows.map((row) => [row.phoneNumber, row])).values());
    const db = getSupabaseAdmin();
    const { data: suppressions, error: suppressionError } = await db.from("sales_suppressions").select("phone_number").in("phone_number", uniqueRows.map((row) => row.phoneNumber));
    if (suppressionError) throw new Error("SALES_SUPPRESSION_LOOKUP_FAILED");
    const suppressed = new Set((suppressions || []).map((item) => item.phone_number));
    const values = uniqueRows.map((row) => ({
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
      ...(suppressed.has(row.phoneNumber) ? { do_not_contact: true, status: "blocked" } : {}),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await db.from("sales_leads").upsert(values, { onConflict: "phone_number" });
    if (error) throw new Error("SALES_IMPORT_FAILED");
    await auditEvent({ actor: adminActor, action: "sales_leads.imported", targetType: "sales_lead", metadata: { accepted: uniqueRows.length, rejected: parsed.rejected.length } });
    refreshSales();
    return adminActionSuccess(`${uniqueRows.length} leads importerades${parsed.rejected.length ? ` · ${parsed.rejected.length} rader hoppades över` : ""}.`);
  } catch (error) {
    return adminActionError(errorMessage(error));
  }
}

export async function approveSalesLeadsWithFeedback(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  requireAdmin();
  try {
    const ids = formData.getAll("lead_id").map(String).map((id) => uuid.parse(id));
    if (!ids.length) return adminActionError("Välj minst ett lead.");
    if (ids.length > 100) return adminActionError("Godkänn högst 100 leads åt gången.");
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("sales_leads").select("id,company_type,source_url,verified_at,do_not_contact").in("id", ids);
    if (error) throw new Error("SALES_LEAD_LOOKUP_FAILED");
    const eligible = (data || []).filter((lead) => lead.company_type === "aktiebolag" && lead.source_url && lead.verified_at && !lead.do_not_contact).map((lead) => lead.id);
    if (!eligible.length) return adminActionError("Inget valt lead uppfyller kraven: aktiebolag, sparad källa, verifieringsdatum och inte spärrat.");
    const { error: updateError } = await db.from("sales_leads").update({ status: "approved", updated_at: new Date().toISOString() }).in("id", eligible);
    if (updateError) throw new Error("SALES_APPROVAL_FAILED");
    await auditEvent({ actor: adminActor, action: "sales_leads.approved", targetType: "sales_lead", metadata: { count: eligible.length } });
    refreshSales();
    return adminActionSuccess(`${eligible.length} leads godkändes för kontakt.`);
  } catch (error) {
    return adminActionError(errorMessage(error));
  }
}

export async function createSalesCampaign(formData: FormData) {
  requireAdmin();
  const name = z.string().min(2).max(160).parse(String(formData.get("name") || "").trim());
  const template = z.string().min(20).max(1000).parse(String(formData.get("message_template") || "").trim());
  const ids = formData.getAll("lead_id").map(String).map((id) => uuid.parse(id));
  if (!ids.length || ids.length > salesBatchLimit()) redirect("/admin/sales/campaigns/new?error=selection");
  const db = getSupabaseAdmin();
  const [demo, leadsResult] = await Promise.all([
    getSalesDemoNumber(),
    db.from("sales_leads").select("id,company_name,phone_number,status,do_not_contact,tracking_token,outbound_count,last_reply_at,demo_called_at").in("id", ids),
  ]);
  if (leadsResult.error) throw new Error("SALES_LEAD_LOOKUP_FAILED");
  const leads = (leadsResult.data || []).filter((lead) => ["approved", "follow_up", "interested", "replied", "demo_tested", "engaged"].includes(lead.status) && !lead.do_not_contact && (lead.outbound_count < 2 || lead.last_reply_at || lead.demo_called_at));
  if (!leads.length) redirect("/admin/sales/campaigns/new?error=eligible");
  const recipients = leads.map((lead) => {
    const rendered = renderSalesMessage(template, lead, demo.provider_number);
    const parts = estimateSmsParts(rendered);
    return { lead, rendered, parts, cost: estimatedSmsCostOre(parts) };
  });
  const { data: campaign, error } = await db.from("sales_campaigns").insert({
    name,
    textback_number_id: demo.id,
    message_template: template,
    recipient_count: recipients.length,
    estimated_parts: recipients.reduce((sum, item) => sum + item.parts, 0),
    estimated_cost_ore: recipients.reduce((sum, item) => sum + item.cost, 0),
  }).select("id").single();
  if (error || !campaign) throw new Error("SALES_CAMPAIGN_CREATE_FAILED");
  const { error: recipientError } = await db.from("sales_campaign_recipients").insert(recipients.map(({ lead, rendered, parts, cost }) => ({
    campaign_id: campaign.id,
    sales_lead_id: lead.id,
    rendered_message: rendered,
    estimated_parts: parts,
    estimated_cost_ore: cost,
  })));
  if (recipientError) throw new Error("SALES_RECIPIENT_CREATE_FAILED");
  await auditEvent({ actor: adminActor, action: "sales_campaign.created", targetType: "sales_campaign", targetId: campaign.id, metadata: { recipients: recipients.length } });
  revalidatePath("/admin/sales/campaigns");
  redirect(`/admin/sales/campaigns/${campaign.id}`);
}

export async function sendSalesCampaignWithFeedback(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  requireAdmin();
  const campaignId = uuid.parse(String(formData.get("campaign_id") || ""));
  try {
    if (!isSalesSendWindow()) throw new Error("SALES_SEND_WINDOW_CLOSED");
    const db = getSupabaseAdmin();
    const { data: campaign, error } = await db.from("sales_campaigns")
      .select("id,status,textback_number_id,textback_numbers(provider,provider_number,active,demo_mode),sales_campaign_recipients(id,status,rendered_message,sales_lead_id,sales_leads(id,company_name,phone_number,status,do_not_contact,outbound_count,first_contacted_at,last_reply_at,demo_called_at))")
      .eq("id", campaignId).maybeSingle();
    if (error || !campaign) throw new Error("SALES_CAMPAIGN_NOT_FOUND");
    if (campaign.status !== "draft") return adminActionError("Kampanjen har redan behandlats.");
    const number = Array.isArray(campaign.textback_numbers) ? campaign.textback_numbers[0] : campaign.textback_numbers;
    if (!number?.active || !number.demo_mode || number.provider !== "46elks") throw new Error("SALES_DEMO_NUMBER_UNAVAILABLE");
    const recipients = (campaign.sales_campaign_recipients || []).filter((recipient: any) => recipient.status === "queued");
    if (!recipients.length) throw new Error("SALES_CAMPAIGN_EMPTY");
    const remaining = await remainingSalesDailyCapacity();
    if (remaining < recipients.length) throw new Error("SALES_DAILY_LIMIT_REACHED");
    const phones = recipients.map((recipient: any) => (Array.isArray(recipient.sales_leads) ? recipient.sales_leads[0] : recipient.sales_leads)?.phone_number).filter(Boolean);
    const { data: suppressions } = await db.from("sales_suppressions").select("phone_number").in("phone_number", phones);
    const suppressed = new Set((suppressions || []).map((item) => item.phone_number));
    await db.from("sales_campaigns").update({ status: "sending", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", campaignId).eq("status", "draft");

    const results = await Promise.all(recipients.map(async (recipient: any) => {
      const lead = Array.isArray(recipient.sales_leads) ? recipient.sales_leads[0] : recipient.sales_leads;
      if (!lead || lead.do_not_contact || suppressed.has(lead.phone_number) || (lead.outbound_count >= 2 && !lead.last_reply_at && !lead.demo_called_at)) {
        await db.from("sales_campaign_recipients").update({ status: "blocked", failure_reason: "suppressed_or_contact_limit", updated_at: new Date().toISOString() }).eq("id", recipient.id);
        return { sent: false, blocked: true };
      }
      const requestId = randomUUID();
      const { data: message, error: messageError } = await db.from("sales_messages").insert({
        sales_lead_id: lead.id,
        campaign_recipient_id: recipient.id,
        textback_number_id: campaign.textback_number_id,
        provider: "46elks",
        direction: "outbound",
        sender_number: number.provider_number,
        recipient_number: lead.phone_number,
        body: recipient.rendered_message,
        delivery_status: "sending",
        client_request_id: requestId,
        raw_event: { source: "sales_campaign", campaign_id: campaignId },
      }).select("id").single();
      if (messageError || !message) return { sent: false, blocked: false };
      await db.from("sales_campaign_recipients").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", recipient.id);
      try {
        const result = await sendElksSms({ from: number.provider_number, to: lead.phone_number, message: recipient.rendered_message, eventId: message.id });
        const now = new Date().toISOString();
        await Promise.all([
          db.from("sales_messages").update({ provider_message_id: result.providerId || null, delivery_status: result.mode === "live" ? result.providerStatus || "sent" : "logged", sms_parts: result.parts || null, sms_cost: result.cost || null, sent_at: now }).eq("id", message.id),
          db.from("sales_campaign_recipients").update({ status: result.mode === "live" ? "sent" : "sent", provider_message_id: result.providerId || null, sent_at: now, updated_at: now }).eq("id", recipient.id),
          db.from("sales_leads").update({ status: lead.status === "follow_up" ? "contacted" : "contacted", outbound_count: lead.outbound_count + 1, first_contacted_at: lead.first_contacted_at || now, last_contacted_at: now, next_follow_up_at: lead.outbound_count === 0 ? new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString() : null, updated_at: now }).eq("id", lead.id),
        ]);
        return { sent: true, blocked: false };
      } catch (sendError) {
        const reason = sendError instanceof Error ? sendError.message.slice(0, 200) : "UNKNOWN";
        const now = new Date().toISOString();
        await Promise.all([
          db.from("sales_messages").update({ delivery_status: "failed", failed_at: now, failure_reason: reason }).eq("id", message.id),
          db.from("sales_campaign_recipients").update({ status: "failed", failure_reason: reason, updated_at: now }).eq("id", recipient.id),
        ]);
        return { sent: false, blocked: false };
      }
    }));

    const sent = results.filter((result) => result.sent).length;
    const failed = results.filter((result) => !result.sent && !result.blocked).length;
    const blocked = results.filter((result) => result.blocked).length;
    await db.from("sales_campaigns").update({
      status: failed ? "partially_failed" : "completed",
      sent_count: sent,
      failed_count: failed + blocked,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", campaignId);
    await auditEvent({ actor: adminActor, action: "sales_campaign.sent", targetType: "sales_campaign", targetId: campaignId, metadata: { sent, failed, blocked } });
    refreshSales();
    revalidatePath(`/admin/sales/campaigns/${campaignId}`);
    return adminActionSuccess(`${sent} SMS skickades${failed || blocked ? ` · ${failed + blocked} hoppades över eller misslyckades` : ""}.`);
  } catch (error) {
    return adminActionError(errorMessage(error));
  }
}

export async function updateSalesLeadWithFeedback(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  requireAdmin();
  try {
    const id = uuid.parse(String(formData.get("lead_id") || ""));
    const status = String(formData.get("status") || "");
    if (!salesLeadStatuses.includes(status as any)) throw new Error("INVALID_STATUS");
    const fitScore = z.coerce.number().int().min(0).max(100).parse(formData.get("fit_score"));
    const notes = z.string().max(4000).parse(String(formData.get("notes") || "").trim()) || null;
    const followUpRaw = String(formData.get("next_follow_up_at") || "").trim();
    const nextFollowUp = followUpRaw ? new Date(followUpRaw).toISOString() : null;
    const block = ["blocked", "not_interested", "invalid"].includes(status);
    const db = getSupabaseAdmin();
    const { data: lead, error } = await db.from("sales_leads").update({ status, fit_score: fitScore, notes, next_follow_up_at: nextFollowUp, do_not_contact: block, updated_at: new Date().toISOString() }).eq("id", id).select("id,phone_number").maybeSingle();
    if (error || !lead) throw new Error("SALES_LEAD_UPDATE_FAILED");
    if (block) await db.from("sales_suppressions").upsert({ phone_number: lead.phone_number, reason: status, source: "admin", sales_lead_id: id }, { onConflict: "phone_number" });
    await auditEvent({ actor: adminActor, action: "sales_lead.updated", targetType: "sales_lead", targetId: id, metadata: { status, fit_score: fitScore } });
    refreshSales();
    revalidatePath(`/admin/sales/leads/${id}`);
    return adminActionSuccess("Leadet är uppdaterat.");
  } catch (error) {
    return adminActionError(errorMessage(error));
  }
}

export async function sendSalesReplyWithFeedback(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  requireAdmin();
  try {
    const leadId = uuid.parse(String(formData.get("lead_id") || ""));
    const requestId = uuid.parse(String(formData.get("request_id") || ""));
    const body = z.string().min(1).max(1000).parse(String(formData.get("message") || "").trim());
    const db = getSupabaseAdmin();
    const { data: existing } = await db.from("sales_messages").select("id").eq("client_request_id", requestId).maybeSingle();
    if (existing) return adminActionSuccess("SMS:et var redan skickat.");
    const [{ data: lead, error: leadError }, demo] = await Promise.all([
      db.from("sales_leads").select("id,phone_number,do_not_contact,status").eq("id", leadId).maybeSingle(),
      getSalesDemoNumber(),
    ]);
    if (leadError || !lead) throw new Error("SALES_LEAD_NOT_FOUND");
    if (lead.do_not_contact) throw new Error("SALES_LEAD_BLOCKED");
    const { data: message, error } = await db.from("sales_messages").insert({ sales_lead_id: lead.id, textback_number_id: demo.id, provider: "46elks", direction: "outbound", sender_number: demo.provider_number, recipient_number: lead.phone_number, body, delivery_status: "sending", client_request_id: requestId, raw_event: { source: "sales_inbox" } }).select("id").single();
    if (error || !message) throw new Error("SALES_MESSAGE_CREATE_FAILED");
    try {
      const result = await sendElksSms({ from: demo.provider_number, to: lead.phone_number, message: body, eventId: message.id });
      const now = new Date().toISOString();
      await Promise.all([
        db.from("sales_messages").update({ provider_message_id: result.providerId || null, delivery_status: result.mode === "live" ? result.providerStatus || "sent" : "logged", sms_parts: result.parts || null, sms_cost: result.cost || null, sent_at: now }).eq("id", message.id),
        db.from("sales_leads").update({ status: lead.status === "interested" ? "interested" : "contacted", last_contacted_at: now, updated_at: now }).eq("id", lead.id),
      ]);
    } catch (sendError) {
      const reason = sendError instanceof Error ? sendError.message.slice(0, 200) : "UNKNOWN";
      await db.from("sales_messages").update({ delivery_status: "failed", failed_at: new Date().toISOString(), failure_reason: reason }).eq("id", message.id);
      throw sendError;
    }
    await auditEvent({ actor: adminActor, action: "sales_message.sent", targetType: "sales_lead", targetId: lead.id });
    refreshSales();
    revalidatePath(`/admin/sales/leads/${lead.id}`);
    return adminActionSuccess("SMS skickat.");
  } catch (error) {
    return adminActionError(errorMessage(error));
  }
}
