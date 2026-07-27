import "server-only";
import type { Lead } from "../lead-schema";
import { customerApplicationEmail, internalApplicationEmail, TEXTBACK_CONTACT_EMAIL } from "./notification-templates";

export interface Notifier {
  application(lead: Lead, id: string): Promise<void>;
  payment(company: string, id: string, paidAt: string): Promise<void>;
  onboarding(input: { email: string; company: string; providerNumber: string; setupUrl: string; leadId: string }): Promise<void>;
  capacity(input: { email: string; company: string; leadId: string }): Promise<void>;
}

type EmailInput = {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey: string;
};

function configured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.TEXTBACK_NOTIFICATION_EMAIL && process.env.TEXTBACK_FROM_EMAIL);
}

function fromAddress() {
  return process.env.TEXTBACK_FROM_EMAIL || `Textback <${TEXTBACK_CONTACT_EMAIL}>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

async function sendEmail(input: EmailInput) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [input.to],
        reply_to: input.replyTo,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`RESEND_${response.status}`);
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error("RESEND_INVALID_RESPONSE");
    return result.id;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendApplicationEmails(lead: Lead, id: string) {
  if (!configured()) {
    if (process.env.NODE_ENV === "production") console.error("[notifications] email configuration missing", { kind: "application" });
    return;
  }

  const customer = customerApplicationEmail(lead, id);
  const internal = internalApplicationEmail(lead, id);
  const results = await Promise.allSettled([
    sendEmail({
      to: lead.email,
      replyTo: TEXTBACK_CONTACT_EMAIL,
      subject: customer.subject,
      text: customer.text,
      html: customer.html,
      idempotencyKey: `pilot-confirmation/${id}`,
    }),
    sendEmail({
      to: process.env.TEXTBACK_NOTIFICATION_EMAIL!,
      replyTo: lead.email,
      subject: internal.subject,
      text: internal.text,
      idempotencyKey: `pilot-internal/${id}`,
    }),
  ]);

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) throw new Error(`APPLICATION_EMAIL_DELIVERY_FAILED_${failures.length}`);
}

export const notifier: Notifier = {
  application: sendApplicationEmails,
  async payment(company, id, paidAt) {
    if (!configured()) return;
    const safeCompany = String(company).replace(/[<>]/g, "").slice(0, 200);
    await sendEmail({
      to: process.env.TEXTBACK_NOTIFICATION_EMAIL!,
      replyTo: TEXTBACK_CONTACT_EMAIL,
      subject: `Betald Textback-beställning: ${safeCompany}`,
      text: `Företag: ${safeCompany}\nLead-id: ${id}\nBetalningsstatus: paid\nDatum: ${paidAt}`,
      idempotencyKey: `pilot-payment/${id}`,
    });
  },
  async onboarding({ email, company, providerNumber, setupUrl, leadId }) {
    if (!configured()) throw new Error("EMAIL_NOT_CONFIGURED");
    const safeCompany = escapeHtml(company.slice(0, 200));
    const safeNumber = escapeHtml(providerNumber);
    const safeUrl = escapeHtml(setupUrl);
    await sendEmail({
      to: email,
      replyTo: TEXTBACK_CONTACT_EMAIL,
      subject: "Slutför din Textback-anslutning",
      text: `Betalningen är registrerad och ett Textback-nummer har reserverats för ${company}.\n\nTextback-nummer: ${providerNumber}\n\nVälj lösenord och fortsätt anslutningen här:\n${setupUrl}\n\nLänken gäller i sju dagar.`,
      html: `<h1>Textback är redo att anslutas</h1><p>Betalningen är registrerad och ett nummer har reserverats för <strong>${safeCompany}</strong>.</p><p><strong>Textback-nummer:</strong> ${safeNumber}</p><p><a href="${safeUrl}">Välj lösenord och fortsätt anslutningen</a></p><p>Länken gäller i sju dagar.</p>`,
      idempotencyKey: `customer-onboarding/${leadId}`,
    });
  },
  async capacity({ email, company, leadId }) {
    if (!configured()) return;
    await sendEmail({
      to: process.env.TEXTBACK_NOTIFICATION_EMAIL!,
      replyTo: email,
      subject: `Nummerpoolen är tom: ${company.slice(0, 160)}`,
      text: `En betald beställning väntar på ett konfigurerat 46elks-nummer.\nFöretag: ${company}\nLead-id: ${leadId}\nKund: ${email}`,
      idempotencyKey: `provider-capacity/${leadId}`,
    });
  },
};

export async function notifySafely(task: () => Promise<void>, kind: "application" | "payment" | "onboarding" | "capacity") {
  try {
    await task();
  } catch (error) {
    console.error("[notifications] delivery failed", {
      kind,
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
  }
}
