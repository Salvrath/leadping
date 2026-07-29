import "server-only";

import { siteUrl } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/server/supabase";

const EMAIL_BATCH_LIMIT = 20;
const EMAIL_DAILY_LIMIT = 50;
const genericMailboxPattern = /^(info|kontakt|contact|kundservice|service|support|offert|bokning|order|hello|hej|mail|reception|receptionen|sales|salj|försäljning|forsaljning|admin|administration|ekonomi|faktura|jobb|booking)$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export type SalesEmailType = "generic" | "personal" | "unknown";

export function normalizeEmailAddress(value?: string | null) {
  const email = String(value || "").trim().toLocaleLowerCase("en-US");
  return emailPattern.test(email) && email.length <= 320 ? email : null;
}

export function classifySalesEmail(value?: string | null): SalesEmailType {
  const email = normalizeEmailAddress(value);
  if (!email) return "unknown";
  const local = email.split("@")[0].replace(/\+.*/, "");
  return genericMailboxPattern.test(local) ? "generic" : "personal";
}

export function isEmailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.TEXTBACK_FROM_EMAIL);
}

export function salesEmailBatchLimit() {
  const configured = Number(process.env.TEXTBACK_SALES_EMAIL_BATCH_LIMIT || EMAIL_BATCH_LIMIT);
  return Number.isFinite(configured) ? Math.max(1, Math.min(50, Math.floor(configured))) : EMAIL_BATCH_LIMIT;
}

export function salesEmailDailyLimit() {
  const configured = Number(process.env.TEXTBACK_SALES_EMAIL_DAILY_LIMIT || EMAIL_DAILY_LIMIT);
  return Number.isFinite(configured) ? Math.max(1, Math.min(500, Math.floor(configured))) : EMAIL_DAILY_LIMIT;
}

export async function remainingSalesEmailDailyCapacity() {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count, error } = await getSupabaseAdmin().from("sales_email_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .in("status", ["sent", "delivered", "clicked", "replied"])
    .gte("sent_at", since.toISOString());
  if (error) throw new Error("SALES_EMAIL_DAILY_LIMIT_LOOKUP_FAILED");
  return Math.max(0, salesEmailDailyLimit() - (count || 0));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function linkify(value: string) {
  return escapeHtml(value).replace(/https:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#176b87;font-weight:700">${url}</a>`);
}

function textToHtml(value: string) {
  return value.split(/\n{2,}/).map((paragraph) => `<p style="margin:0 0 16px;line-height:1.55">${linkify(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
}

function replaceVariables(template: string, input: { companyName: string; demoNumber: string; link: string; unsubscribeUrl: string }) {
  return template
    .replaceAll("{{companyName}}", input.companyName)
    .replaceAll("{{demoNumber}}", input.demoNumber)
    .replaceAll("{{link}}", input.link)
    .replaceAll("{{unsubscribeUrl}}", input.unsubscribeUrl);
}

export const defaultSalesEmailSubject = "Vad händer när ni missar ett kundsamtal?";
export const defaultSalesEmailBody = `Hej {{companyName}},

Textback skickar automatiskt ett SMS när ert företag inte kan svara på ett inkommande kundsamtal. Kunden kan beskriva sitt ärende direkt och svaret samlas i en enkel leadinkorg.

Ring {{demoNumber}} och lägg på för att testa upplevelsen själv.

Läs mer: {{link}}

/Textback

Vill ni inte få fler mejl från oss kan ni avregistrera er här: {{unsubscribeUrl}}`;

export function renderSalesEmail(input: {
  subjectTemplate: string;
  bodyTemplate: string;
  companyName: string;
  leadTrackingToken: string;
  recipientTrackingToken: string;
  unsubscribeToken: string;
}) {
  const link = `${siteUrl}/t/${input.leadTrackingToken}?email_recipient=${input.recipientTrackingToken}`;
  const unsubscribeUrl = `${siteUrl}/email/unsubscribe/${input.unsubscribeToken}`;
  const variables = { companyName: input.companyName, demoNumber: "076-686 77 23", link, unsubscribeUrl };
  const subject = replaceVariables(input.subjectTemplate, variables).replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  let text = replaceVariables(input.bodyTemplate, variables).trim();
  if (!text.includes(unsubscribeUrl)) text += `\n\nAvregistrera: ${unsubscribeUrl}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#10243e"><div style="padding:24px 0 20px"><img src="${siteUrl}/textback-logo.svg" alt="Textback" width="180" style="display:block"></div>${textToHtml(text)}<p style="margin-top:30px;padding-top:18px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5">Detta mejl skickades till ett offentligt angivet företagskonto. <a href="${unsubscribeUrl}" style="color:#526277">Avregistrera adressen</a>.</p></div>`;
  return { subject, text, html, link, unsubscribeUrl };
}

export async function sendSalesEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  unsubscribeUrl: string;
  idempotencyKey: string;
}) {
  if (!isEmailDeliveryConfigured()) throw new Error("EMAIL_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.TEXTBACK_FROM_EMAIL,
        to: [input.to],
        reply_to: "info@textback.se",
        subject: input.subject,
        text: input.text,
        html: input.html,
        headers: {
          "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          "X-Entity-Ref-ID": input.idempotencyKey,
        },
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`RESEND_${response.status}_${body.slice(0, 120)}`);
    }
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error("RESEND_INVALID_RESPONSE");
    return result.id;
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshEmailCampaignStats(campaignId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("sales_email_campaign_recipients").select("status").eq("campaign_id", campaignId);
  if (error) throw new Error("SALES_EMAIL_STATS_FAILED");
  const statuses = data || [];
  const count = (values: string[]) => statuses.filter((row) => values.includes(row.status)).length;
  await db.from("sales_email_campaigns").update({
    sent_count: count(["sent", "delivered", "clicked", "replied"]),
    delivered_count: count(["delivered", "clicked", "replied"]),
    clicked_count: count(["clicked", "replied"]),
    replied_count: count(["replied"]),
    bounced_count: count(["bounced"]),
    failed_count: count(["failed", "blocked", "skipped"]),
    updated_at: new Date().toISOString(),
  }).eq("id", campaignId);
}