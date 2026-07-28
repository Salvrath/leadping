import "server-only";
import type { Lead } from "../lead-schema";
import { siteUrl } from "../site";
import { customerApplicationEmail, internalApplicationEmail, TEXTBACK_CONTACT_EMAIL } from "./notification-templates";

export interface Notifier {
  application(lead: Lead, id: string): Promise<void>;
  payment(company: string, id: string, paidAt: string): Promise<void>;
  onboarding(input: { email: string; company: string; providerNumber: string; setupUrl: string; leadId: string }): Promise<void>;
  capacity(input: { email: string; company: string; leadId: string }): Promise<void>;
  newLead(input: { email: string; businessName: string; customerNumber: string; message: string; conversationId: string; messageId: string }): Promise<void>;
}

type EmailInput = { to: string; replyTo: string; subject: string; text: string; html?: string; idempotencyKey: string };

function emailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.TEXTBACK_FROM_EMAIL);
}
function internalNotificationsConfigured() {
  return Boolean(emailDeliveryConfigured() && process.env.TEXTBACK_NOTIFICATION_EMAIL);
}
function fromAddress() { return process.env.TEXTBACK_FROM_EMAIL || `Textback <${TEXTBACK_CONTACT_EMAIL}>`; }
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

async function sendEmail(input: EmailInput) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({ from: fromAddress(), to: [input.to], reply_to: input.replyTo, subject: input.subject, text: input.text, ...(input.html ? { html: input.html } : {}) }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`RESEND_${response.status}`);
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error("RESEND_INVALID_RESPONSE");
    return result.id;
  } finally { clearTimeout(timeout); }
}

async function sendApplicationEmails(lead: Lead, id: string) {
  if (!emailDeliveryConfigured()) {
    if (process.env.NODE_ENV === "production") console.error("[notifications] email configuration missing", { kind: "application" });
    return;
  }
  const customer = customerApplicationEmail(lead, id);
  const internal = internalApplicationEmail(lead, id);
  const tasks = [
    sendEmail({ to: lead.email, replyTo: TEXTBACK_CONTACT_EMAIL, subject: customer.subject, text: customer.text, html: customer.html, idempotencyKey: `pilot-confirmation/${id}` }),
  ];
  if (process.env.TEXTBACK_NOTIFICATION_EMAIL) {
    tasks.push(sendEmail({ to: process.env.TEXTBACK_NOTIFICATION_EMAIL, replyTo: lead.email, subject: internal.subject, text: internal.text, idempotencyKey: `pilot-internal/${id}` }));
  }
  const results = await Promise.allSettled(tasks);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) throw new Error(`APPLICATION_EMAIL_DELIVERY_FAILED_${failures.length}`);
}

export const notifier: Notifier = {
  application: sendApplicationEmails,
  async payment(company, id, paidAt) {
    if (!internalNotificationsConfigured()) return;
    const safeCompany = String(company).replace(/[<>]/g, "").slice(0, 200);
    await sendEmail({
      to: process.env.TEXTBACK_NOTIFICATION_EMAIL!, replyTo: TEXTBACK_CONTACT_EMAIL,
      subject: `Betald Textback-beställning: ${safeCompany}`,
      text: `Företag: ${safeCompany}\nLead-id: ${id}\nBetalningsstatus: paid\nDatum: ${paidAt}`,
      idempotencyKey: `pilot-payment/${id}`,
    });
  },
  async onboarding({ email, company, providerNumber, setupUrl, leadId }) {
    if (!emailDeliveryConfigured()) throw new Error("EMAIL_NOT_CONFIGURED");
    const safeCompany = escapeHtml(company.slice(0, 200));
    const safeNumber = escapeHtml(providerNumber);
    const safeUrl = escapeHtml(setupUrl);
    await sendEmail({
      to: email, replyTo: TEXTBACK_CONTACT_EMAIL, subject: "Slutför din Textback-anslutning",
      text: `Betalmetoden är registrerad och ett Textback-nummer har reserverats för ${company}. Ingen debitering sker innan telefonin har verifierats och tjänsten aktiveras.\n\nTextback-nummer: ${providerNumber}\n\nVälj lösenord och fortsätt anslutningen här:\n${setupUrl}\n\nLänken gäller i sju dagar.`,
      html: `<h1>Textback är redo att anslutas</h1><p>Betalmetoden är registrerad och ett nummer har reserverats för <strong>${safeCompany}</strong>. Ingen debitering sker innan telefonin har verifierats och tjänsten aktiveras.</p><p><strong>Textback-nummer:</strong> ${safeNumber}</p><p><a href="${safeUrl}">Välj lösenord och fortsätt anslutningen</a></p><p>Länken gäller i sju dagar.</p>`,
      idempotencyKey: `customer-onboarding/${leadId}`,
    });
  },
  async capacity({ email, company, leadId }) {
    if (!internalNotificationsConfigured()) return;
    await sendEmail({
      to: process.env.TEXTBACK_NOTIFICATION_EMAIL!, replyTo: email,
      subject: `Nummerpoolen är tom: ${company.slice(0, 160)}`,
      text: `En beställning med sparad betalmetod väntar på ett konfigurerat 46elks-nummer. Ingen debitering har skett.\nFöretag: ${company}\nLead-id: ${leadId}\nKund: ${email}`,
      idempotencyKey: `provider-capacity/${leadId}`,
    });
  },
  async newLead({ email, businessName, customerNumber, message, conversationId, messageId }) {
    if (!emailDeliveryConfigured()) throw new Error("EMAIL_NOT_CONFIGURED");
    const conversationUrl = `${siteUrl}/portal/conversations/${conversationId}`;
    const safeBusiness = escapeHtml(businessName.slice(0, 200));
    const safeNumber = escapeHtml(customerNumber.slice(0, 80));
    const safeMessage = escapeHtml(message.slice(0, 2000)).replaceAll("\n", "<br/>");
    const safeUrl = escapeHtml(conversationUrl);
    await sendEmail({
      to: email,
      replyTo: TEXTBACK_CONTACT_EMAIL,
      subject: `Nytt kundärende till ${businessName.slice(0, 120)}`,
      text: `Ett nytt kundärende har kommit in via Textback.\n\nTelefonnummer: ${customerNumber}\n\nKundens meddelande:\n${message}\n\nÖppna ärendet:\n${conversationUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px"><p style="color:#176b87;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Nytt kundärende</p><h1 style="color:#10243e">${safeBusiness}</h1><p><strong>Telefonnummer:</strong> ${safeNumber}</p><div style="background:#f4f7fb;border-radius:12px;padding:18px;margin:20px 0"><strong>Kundens meddelande</strong><p style="margin:8px 0 0">${safeMessage}</p></div><p><a href="${safeUrl}" style="display:inline-block;background:#176b87;color:white;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Öppna i Textback</a></p></div>`,
      idempotencyKey: `new-lead/${messageId}`,
    });
  },
};

export async function notifySafely(task: () => Promise<void>, kind: "application" | "payment" | "onboarding" | "capacity" | "new-lead") {
  try { await task(); }
  catch (error) { console.error("[notifications] delivery failed", { kind, code: error instanceof Error ? error.message : "UNKNOWN" }); }
}
