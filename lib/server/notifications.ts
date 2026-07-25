import "server-only";
import { Resend } from "resend";
import type { Lead } from "../lead-schema";
import { customerApplicationEmail, internalApplicationEmail, TEXTBACK_CONTACT_EMAIL } from "./notification-templates";

export interface Notifier {
  application(lead: Lead, id: string): Promise<void>;
  payment(company: string, id: string, paidAt: string): Promise<void>;
}

function configured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.TEXTBACK_NOTIFICATION_EMAIL && process.env.TEXTBACK_FROM_EMAIL);
}

function fromAddress() {
  return process.env.TEXTBACK_FROM_EMAIL || `Textback <${TEXTBACK_CONTACT_EMAIL}>`;
}

async function sendApplicationEmails(lead: Lead, id: string) {
  if (!configured()) {
    if (process.env.NODE_ENV === "production") console.error("[notifications] email configuration missing", { kind: "application" });
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const customer = customerApplicationEmail(lead, id);
  const internal = internalApplicationEmail(lead, id);
  const results = await Promise.allSettled([
    resend.emails.send({
      from: fromAddress(),
      to: lead.email,
      replyTo: TEXTBACK_CONTACT_EMAIL,
      subject: customer.subject,
      text: customer.text,
      html: customer.html,
    }, { idempotencyKey: `pilot-confirmation/${id}` }),
    resend.emails.send({
      from: fromAddress(),
      to: process.env.TEXTBACK_NOTIFICATION_EMAIL!,
      replyTo: lead.email,
      subject: internal.subject,
      text: internal.text,
    }, { idempotencyKey: `pilot-internal/${id}` }),
  ]);

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) throw new Error(`APPLICATION_EMAIL_DELIVERY_FAILED_${failures.length}`);
}

export const notifier: Notifier = {
  application: sendApplicationEmails,
  async payment(company, id, paidAt) {
    if (!configured()) return;
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: fromAddress(),
      to: process.env.TEXTBACK_NOTIFICATION_EMAIL!,
      replyTo: TEXTBACK_CONTACT_EMAIL,
      subject: `Betald Textback-beställning: ${String(company).replace(/[<>]/g, "").slice(0, 200)}`,
      text: `Företag: ${String(company).replace(/[<>]/g, "").slice(0, 2000)}\nLead-id: ${id}\nBetalningsstatus: paid\nDatum: ${paidAt}`,
    }, { idempotencyKey: `pilot-payment/${id}` });
  },
};

export async function notifySafely(task: () => Promise<void>, kind: "application" | "payment") {
  try {
    await task();
  } catch (error) {
    console.error("[notifications] delivery failed", {
      kind,
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
  }
}
