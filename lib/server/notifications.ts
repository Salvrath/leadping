import "server-only";
import { Resend } from "resend";
import type { Lead } from "../lead-schema";

export interface Notifier {
  application(lead: Lead, id: string): Promise<void>;
  payment(company: string, id: string, paidAt: string): Promise<void>;
}

function configured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.TEXTBACK_NOTIFICATION_EMAIL && process.env.TEXTBACK_FROM_EMAIL);
}

function text(value: unknown) { return String(value ?? "-").replace(/[<>]/g, "").slice(0, 2000); }

export const notifier: Notifier = {
  async application(lead, id) {
    if (!configured()) return;
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.TEXTBACK_FROM_EMAIL!, to: process.env.TEXTBACK_NOTIFICATION_EMAIL!,
      subject: `Ny Textback-pilot: ${text(lead.company)}`,
      text: [`Lead-id: ${id}`, `Företag: ${text(lead.company)}`, `Kontakt: ${text(lead.contact)}`,
        `E-post: ${text(lead.email)}`, `Telefon: ${text(lead.phone)}`, `Verkstadsnummer: ${text(lead.workshopPhone)}`,
        `Telefoni: ${text(lead.telephony)}`, `Missade samtal/vecka: ${lead.missedCalls}`, `Anställda: ${lead.employees}`,
        `Attribution: ${text([lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / "))}`].join("\n"),
    });
  },
  async payment(company, id, paidAt) {
    if (!configured()) return;
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from: process.env.TEXTBACK_FROM_EMAIL!, to: process.env.TEXTBACK_NOTIFICATION_EMAIL!,
      subject: `Betald Textback-pilot: ${text(company)}`,
      text: `Företag: ${text(company)}\nLead-id: ${id}\nBetalningsstatus: paid\nDatum: ${paidAt}\nStarta kompatibilitetskontrollen.`,
    });
  },
};

export async function notifySafely(task: () => Promise<void>, kind: "application" | "payment") {
  try { await task(); } catch { console.error("[notifications] delivery failed", { kind }); }
}
