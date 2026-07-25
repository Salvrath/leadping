import type { Lead } from "../lead-schema";

export const TEXTBACK_CONTACT_EMAIL = "info@textback.se";

function clean(value: unknown, maxLength = 2000) {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, maxLength);
}

function escapeHtml(value: unknown) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function row(label: string, value: unknown) {
  const normalized = clean(value) || "–";
  return `${label}: ${normalized}`;
}

export function customerApplicationEmail(lead: Lead, id: string) {
  const firstName = clean(lead.contact).split(/\s+/)[0] || "Hej";
  const subject = "Vi har tagit emot er förfrågan – Textback";
  const text = [
    `Hej ${firstName},`,
    "",
    `Vi har tagit emot er förfrågan för ${clean(lead.company)} och kontrollerar nu hur Textback kan anslutas till er nuvarande telefoni.`,
    "",
    "Vi återkommer normalt inom en arbetsdag med besked om kompatibilitet och nästa steg. Ingen betalning sker innan ni har fått ett tydligt upplägg och bekräftat beställningen.",
    "",
    "Sammanfattning",
    row("Företag", lead.company),
    row("Kontaktperson", lead.contact),
    row("Företagets nummer", lead.businessPhone),
    row("Antal nummer", lead.phoneNumbers),
    row("Nuvarande telefoni", lead.telephony),
    row("Referens", id),
    "",
    `Har något blivit fel kan ni svara på detta mejl eller kontakta ${TEXTBACK_CONTACT_EMAIL}.`,
    "",
    "Textback",
    "Missa samtalet – inte kunden.",
  ].join("\n");

  const html = `<!doctype html><html lang="sv"><body style="margin:0;background:#f4f1eb;color:#10243e;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><div style="background:#ffffff;border-radius:18px;padding:32px;border:1px solid #e7e2d8"><p style="margin:0 0 18px;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#168a86">Textback</p><h1 style="margin:0 0 18px;font-size:28px;line-height:1.2">Vi har tagit emot er förfrågan.</h1><p>Hej ${escapeHtml(firstName)},</p><p>Vi har tagit emot er förfrågan för <strong>${escapeHtml(lead.company)}</strong> och kontrollerar nu hur Textback kan anslutas till er nuvarande telefoni.</p><p>Vi återkommer normalt inom en arbetsdag med besked om kompatibilitet och nästa steg. Ingen betalning sker innan ni har fått ett tydligt upplägg och bekräftat beställningen.</p><div style="margin:24px 0;padding:20px;background:#f7f8fa;border-radius:12px"><strong>Sammanfattning</strong><p style="line-height:1.7;margin:12px 0 0">Företag: ${escapeHtml(lead.company)}<br>Kontaktperson: ${escapeHtml(lead.contact)}<br>Företagets nummer: ${escapeHtml(lead.businessPhone)}<br>Antal nummer: ${escapeHtml(lead.phoneNumbers)}<br>Nuvarande telefoni: ${escapeHtml(lead.telephony)}<br>Referens: ${escapeHtml(id)}</p></div><p>Har något blivit fel kan ni svara på detta mejl eller kontakta <a href="mailto:${TEXTBACK_CONTACT_EMAIL}" style="color:#168a86">${TEXTBACK_CONTACT_EMAIL}</a>.</p><p style="margin-top:28px">Textback<br><span style="color:#667085">Missa samtalet – inte kunden.</span></p></div></div></body></html>`;

  return { subject, text, html };
}

export function internalApplicationEmail(lead: Lead, id: string) {
  const subject = `Ny Textback-förfrågan: ${clean(lead.company, 120)}`;
  const text = [
    row("Lead-id", id),
    row("Företag", lead.company),
    row("Kontakt", lead.contact),
    row("E-post", lead.email),
    row("Kontakttelefon", lead.phone),
    row("Företagsnummer", lead.businessPhone),
    row("Antal nummer", lead.phoneNumbers),
    row("Telefoni", lead.telephony),
    row("Bransch", lead.industry),
    row("Missade samtal/vecka", lead.missedCalls),
    row("Meddelande", lead.message),
    row("Attribution", [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ")),
    row("Landningssida", lead.landingPath),
    row("Referrer", lead.referrer),
  ].join("\n");
  return { subject, text };
}
