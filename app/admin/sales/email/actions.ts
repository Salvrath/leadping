"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminActionError, adminActionSuccess, type AdminActionState } from "@/lib/admin-action-state";
import { requireAdmin } from "@/lib/server/admin-auth";
import { auditEvent } from "@/lib/server/security";
import { assertSalesOutboundEnabled } from "@/lib/server/sales-assistant";
import {
  classifySalesEmail,
  defaultSalesEmailBody,
  defaultSalesEmailSubject,
  normalizeEmailAddress,
  refreshEmailCampaignStats,
  remainingSalesEmailDailyCapacity,
  renderSalesEmail,
  salesEmailBatchLimit,
  sendSalesEmail,
} from "@/lib/server/sales-email";
import { isSalesSendWindow } from "@/lib/server/sales";
import { normalizePhoneNumber } from "@/lib/server/telephony/number";
import { getSupabaseAdmin } from "@/lib/server/supabase";

const uuid = z.string().uuid();
const adminActor = { type: "admin" as const, id: "internal-admin" };
const refresh = () => {
  revalidatePath("/admin/sales");
  revalidatePath("/admin/sales/email");
};

function safeDate(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function splitLine(line: string, delimiter: string) {
  const result: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { result.push(value.trim()); value = ""; }
    else value += char;
  }
  result.push(value.trim());
  return result;
}

function header(value: string) {
  return value.trim().toLocaleLowerCase("sv-SE").replace(/[\s_-]+/g, "");
}

function pick(row: Record<string, string>, names: string[]) {
  for (const name of names) {
    const value = row[header(name)];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function verifiedEmailContact(lead: { email_type?: string | null; contact_name?: string | null; contact_role?: string | null }) {
  return lead.email_type === "generic" || Boolean(lead.email_type === "personal" && lead.contact_name && lead.contact_role);
}

export async function importSalesEmailsWithFeedback(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  requireAdmin();
  try {
    const pasted = String(formData.get("csv") || "").trim();
    const file = formData.get("file");
    const fileText = file instanceof File && file.size > 0 ? await file.text() : "";
    const input = pasted || fileText;
    if (!input) return adminActionError("Klistra in CSV-data eller välj en CSV-fil.");
    const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return adminActionError("CSV-filen saknar data.");
    if (lines.length > 501) return adminActionError("Importera högst 500 adresser åt gången.");
    const delimiter = (lines[0].match(/;/g)?.length || 0) >= (lines[0].match(/,/g)?.length || 0) ? ";" : ",";
    const headers = splitLine(lines[0], delimiter).map(header);
    const rows = lines.slice(1).map((line) => {
      const values = splitLine(line, delimiter);
      const row = Object.fromEntries(headers.map((key, index) => [key, values[index] || ""]));
      return {
        companyName: pick(row, ["företagsnamn", "foretagsnamn", "company", "companyname", "namn"]),
        phone: normalizePhoneNumber(pick(row, ["mobilnummer", "telefonnummer", "telefon", "phone", "mobile"])),
        organizationNumber: pick(row, ["organisationsnummer", "orgnummer", "orgnr", "organizationnumber"]),
        email: normalizeEmailAddress(pick(row, ["e-post", "epost", "email", "mail"])),
        sourceUrl: pick(row, ["e-postkälla", "epostkalla", "källa", "kalla", "source", "sourceurl", "url"]),
        verifiedAt: safeDate(pick(row, ["e-postverifierad", "epostverifierad", "verifierad", "verifieringsdatum", "verifiedat"])),
      };
    });

    const db = getSupabaseAdmin();
    const [{ data: leads, error: leadError }, { data: suppressions, error: suppressionError }] = await Promise.all([
      db.from("sales_leads").select("id,company_name,phone_number,organization_number,email_unsubscribe_token,contact_name,contact_role").limit(2000),
      db.from("sales_email_suppressions").select("email_address"),
    ]);
    if (leadError || suppressionError) throw new Error("SALES_EMAIL_IMPORT_LOOKUP_FAILED");
    const suppressed = new Set((suppressions || []).map((item) => item.email_address.toLocaleLowerCase("en-US")));
    let updated = 0;
    let review = 0;
    let rejected = 0;
    const seen = new Set<string>();

    for (const row of rows) {
      if (!row.email || seen.has(row.email)) { rejected += 1; continue; }
      seen.add(row.email);
      const lead = (leads || []).find((candidate) =>
        (row.phone && candidate.phone_number === row.phone)
        || (row.organizationNumber && candidate.organization_number === row.organizationNumber)
        || (row.companyName && candidate.company_name.toLocaleLowerCase("sv-SE") === row.companyName.toLocaleLowerCase("sv-SE"))
      );
      if (!lead) { rejected += 1; continue; }
      const emailType = classifySalesEmail(row.email);
      const isSuppressed = suppressed.has(row.email);
      const hasVerifiedRecipient = emailType === "generic" || Boolean(emailType === "personal" && lead.contact_name && lead.contact_role);
      const verified = hasVerifiedRecipient && Boolean(row.sourceUrl?.startsWith("https://") && row.verifiedAt) && !isSuppressed;
      const emailStatus = isSuppressed ? "unsubscribed" : verified ? "verified" : "pending";
      const { error } = await db.from("sales_leads").update({
        email_address: row.email,
        email_type: emailType,
        email_source_url: row.sourceUrl || null,
        email_verified_at: row.verifiedAt,
        email_status: emailStatus,
        updated_at: new Date().toISOString(),
      }).eq("id", lead.id);
      if (error) { rejected += 1; continue; }
      updated += 1;
      if (!verified) review += 1;
    }
    await auditEvent({ actor: adminActor, action: "sales_emails.imported", targetType: "sales_lead", metadata: { updated, review, rejected } });
    refresh();
    return adminActionSuccess(`${updated} e-postadresser sparades · ${review} kräver kontroll · ${rejected} rader hoppades över.`);
  } catch {
    return adminActionError("E-postimporten kunde inte slutföras.");
  }
}

export async function updateSalesLeadEmailWithFeedback(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  requireAdmin();
  try {
    const leadId = uuid.parse(String(formData.get("lead_id") || ""));
    const email = normalizeEmailAddress(String(formData.get("email_address") || ""));
    if (!email) return adminActionError("Ange en giltig e-postadress.");
    const sourceUrl = z.string().url().parse(String(formData.get("email_source_url") || "").trim());
    if (!sourceUrl.startsWith("https://")) return adminActionError("Källan måste använda HTTPS.");
    const verifiedAt = safeDate(String(formData.get("email_verified_at") || ""));
    if (!verifiedAt) return adminActionError("Ange ett giltigt verifieringsdatum.");
    const emailType = classifySalesEmail(email);
    const db = getSupabaseAdmin();
    const [{ data: suppression }, { data: lead, error: leadError }] = await Promise.all([
      db.from("sales_email_suppressions").select("id").ilike("email_address", email).maybeSingle(),
      db.from("sales_leads").select("contact_name,contact_role").eq("id", leadId).maybeSingle(),
    ]);
    if (leadError || !lead) throw new Error("SALES_EMAIL_UPDATE_FAILED");
    const canVerify = emailType === "generic" || Boolean(emailType === "personal" && lead.contact_name && lead.contact_role);
    const emailStatus = suppression ? "unsubscribed" : canVerify ? "verified" : "pending";
    const { error } = await db.from("sales_leads").update({ email_address: email, email_type: emailType, email_source_url: sourceUrl, email_verified_at: verifiedAt, email_status: emailStatus, updated_at: new Date().toISOString() }).eq("id", leadId);
    if (error) throw new Error("SALES_EMAIL_UPDATE_FAILED");
    await auditEvent({ actor: adminActor, action: "sales_email.updated", targetType: "sales_lead", targetId: leadId, metadata: { email_type: emailType, email_status: emailStatus } });
    refresh();
    revalidatePath(`/admin/sales/leads/${leadId}`);
    return adminActionSuccess(canVerify ? "E-postadressen är verifierad för kampanjer." : "Adressen är sparad men kräver en namngiven mottagare och roll.");
  } catch {
    return adminActionError("E-postuppgifterna kunde inte sparas.");
  }
}

export async function createSalesEmailCampaign(formData: FormData) {
  requireAdmin();
  const name = z.string().min(2).max(160).parse(String(formData.get("name") || "").trim());
  const subjectTemplate = z.string().min(2).max(200).parse(String(formData.get("subject_template") || defaultSalesEmailSubject).trim());
  const bodyTemplate = z.string().min(20).max(10000).parse(String(formData.get("body_template") || defaultSalesEmailBody).trim());
  const ids = formData.getAll("lead_id").map(String).map((id) => uuid.parse(id));
  if (!ids.length || ids.length > salesEmailBatchLimit()) redirect("/admin/sales/email/new?error=selection");
  const db = getSupabaseAdmin();
  const [{ data: leads, error }, { data: suppressions }] = await Promise.all([
    db.from("sales_leads").select("id,company_name,contact_name,contact_role,email_address,email_type,email_status,email_verified_at,email_outbound_count,email_unsubscribe_token,tracking_token,do_not_contact").in("id", ids),
    db.from("sales_email_suppressions").select("email_address"),
  ]);
  if (error) throw new Error("SALES_EMAIL_LEADS_FAILED");
  const suppressed = new Set((suppressions || []).map((item) => item.email_address.toLocaleLowerCase("en-US")));
  const eligible = (leads || []).filter((lead) => lead.email_address && lead.email_verified_at && verifiedEmailContact(lead) && lead.email_status === "verified" && !lead.do_not_contact && lead.email_outbound_count < 2 && !suppressed.has(lead.email_address.toLocaleLowerCase("en-US")));
  if (!eligible.length) redirect("/admin/sales/email/new?error=eligible");
  const { data: campaign, error: campaignError } = await db.from("sales_email_campaigns").insert({ name, subject_template: subjectTemplate, body_template: bodyTemplate, recipient_count: eligible.length }).select("id").single();
  if (campaignError || !campaign) throw new Error("SALES_EMAIL_CAMPAIGN_CREATE_FAILED");
  const recipients = eligible.map((lead) => {
    const recipientTrackingToken = randomUUID();
    const rendered = renderSalesEmail({
      subjectTemplate,
      bodyTemplate,
      companyName: lead.company_name,
      leadTrackingToken: lead.tracking_token,
      recipientTrackingToken,
      unsubscribeToken: lead.email_unsubscribe_token,
    });
    return {
      campaign_id: campaign.id,
      sales_lead_id: lead.id,
      tracking_token: recipientTrackingToken,
      email_address: lead.email_address,
      rendered_subject: rendered.subject,
      rendered_text: rendered.text,
      rendered_html: rendered.html,
    };
  });
  const { error: recipientError } = await db.from("sales_email_campaign_recipients").insert(recipients);
  if (recipientError) throw new Error("SALES_EMAIL_RECIPIENT_CREATE_FAILED");
  await auditEvent({ actor: adminActor, action: "sales_email_campaign.created", targetType: "sales_email_campaign", targetId: campaign.id, metadata: { recipients: recipients.length } });
  refresh();
  redirect(`/admin/sales/email/${campaign.id}`);
}

export async function sendSalesEmailCampaignWithFeedback(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  requireAdmin();
  const campaignId = uuid.parse(String(formData.get("campaign_id") || ""));
  try {
    const settings = await assertSalesOutboundEnabled();
    if (!isSalesSendWindow()) return adminActionError("E-postutskick kan göras vardagar klockan 08–18.");
    const db = getSupabaseAdmin();
    const { data: campaign, error } = await db.from("sales_email_campaigns")
      .select("id,status,sales_email_campaign_recipients(id,status,email_address,rendered_subject,rendered_text,rendered_html,sales_lead_id,sales_leads(id,contact_name,contact_role,email_type,email_status,email_verified_at,email_outbound_count,email_first_contacted_at,email_unsubscribe_token,do_not_contact))")
      .eq("id", campaignId).maybeSingle();
    if (error || !campaign) throw new Error("SALES_EMAIL_CAMPAIGN_NOT_FOUND");
    if (campaign.status !== "draft") return adminActionError("Kampanjen har redan behandlats.");
    const recipients = (campaign.sales_email_campaign_recipients || []).filter((recipient: any) => recipient.status === "queued");
    if (!recipients.length) return adminActionError("Kampanjen saknar mottagare.");
    const remaining = await remainingSalesEmailDailyCapacity();
    if (remaining < recipients.length) return adminActionError("Dagens e-postgräns är nådd.");
    const addresses = recipients.map((recipient: any) => recipient.email_address);
    const { data: suppressions } = await db.from("sales_email_suppressions").select("email_address").in("email_address", addresses);
    const suppressed = new Set((suppressions || []).map((item) => item.email_address.toLocaleLowerCase("en-US")));
    await db.from("sales_email_campaigns").update({ status: "sending", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", campaignId).eq("status", "draft");

    let sent = 0;
    let failed = 0;
    let blocked = 0;
    for (const recipient of recipients as any[]) {
      const lead = Array.isArray(recipient.sales_leads) ? recipient.sales_leads[0] : recipient.sales_leads;
      if (!lead || lead.do_not_contact || lead.email_status !== "verified" || !lead.email_verified_at || !verifiedEmailContact(lead) || lead.email_outbound_count >= 2 || suppressed.has(recipient.email_address.toLocaleLowerCase("en-US"))) {
        blocked += 1;
        await db.from("sales_email_campaign_recipients").update({ status: "blocked", failure_reason: "suppressed_or_contact_not_verified", updated_at: new Date().toISOString() }).eq("id", recipient.id);
        continue;
      }
      await db.from("sales_email_campaign_recipients").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", recipient.id);
      try {
        const unsubscribeUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://textback.se"}/email/unsubscribe/${lead.email_unsubscribe_token}`;
        const providerId = await sendSalesEmail({
          to: recipient.email_address,
          subject: recipient.rendered_subject,
          text: recipient.rendered_text,
          html: recipient.rendered_html,
          unsubscribeUrl,
          idempotencyKey: `sales-email/${recipient.id}`,
        });
        const now = new Date().toISOString();
        await Promise.all([
          db.from("sales_email_campaign_recipients").update({ status: "sent", provider_message_id: providerId, sent_at: now, updated_at: now }).eq("id", recipient.id),
          db.from("sales_leads").update({
            email_outbound_count: lead.email_outbound_count + 1,
            email_first_contacted_at: lead.email_first_contacted_at || now,
            email_last_contacted_at: now,
            last_contacted_at: now,
            next_follow_up_at: lead.email_outbound_count === 0 ? new Date(Date.now() + settings.follow_up_after_days * 24 * 60 * 60_000).toISOString() : null,
            status: "contacted",
            updated_at: now,
          }).eq("id", lead.id),
        ]);
        sent += 1;
      } catch (sendError) {
        failed += 1;
        const reason = sendError instanceof Error ? sendError.message.slice(0, 300) : "UNKNOWN";
        await db.from("sales_email_campaign_recipients").update({ status: "failed", failure_reason: reason, updated_at: new Date().toISOString() }).eq("id", recipient.id);
      }
    }
    await db.from("sales_email_campaigns").update({ status: failed || blocked ? "partially_failed" : "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", campaignId);
    await refreshEmailCampaignStats(campaignId);
    await auditEvent({ actor: adminActor, action: "sales_email_campaign.sent", targetType: "sales_email_campaign", targetId: campaignId, metadata: { sent, failed, blocked } });
    refresh();
    revalidatePath(`/admin/sales/email/${campaignId}`);
    return adminActionSuccess(`${sent} mejl skickades${failed || blocked ? ` · ${failed + blocked} hoppades över eller misslyckades` : ""}.`);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "SALES_OUTBOUND_PAUSED") return adminActionError("All utgående försäljning är pausad.");
    if (code === "EMAIL_NOT_CONFIGURED") return adminActionError("Resend eller avsändaradressen är inte konfigurerad.");
    return adminActionError("E-postkampanjen kunde inte skickas.");
  }
}
