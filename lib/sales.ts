export const salesLeadStatuses = [
  "review",
  "approved",
  "contacted",
  "engaged",
  "demo_tested",
  "replied",
  "interested",
  "follow_up",
  "converted",
  "not_interested",
  "invalid",
  "blocked",
] as const;

export type SalesLeadStatus = typeof salesLeadStatuses[number];

export const salesLeadStatusLabels: Record<SalesLeadStatus, string> = {
  review: "Behöver granskas",
  approved: "Godkänd",
  contacted: "Kontaktad",
  engaged: "Besökt sidan",
  demo_tested: "Testat demon",
  replied: "Svarat",
  interested: "Intresserad",
  follow_up: "Följ upp",
  converted: "Ansluten",
  not_interested: "Inte intresserad",
  invalid: "Felaktig kontakt",
  blocked: "Spärrad",
};

export const salesReplyClassifications = [
  "interested",
  "question",
  "call_requested",
  "later",
  "not_interested",
  "wrong_number",
  "stop",
] as const;

export type SalesReplyClassification = typeof salesReplyClassifications[number];

export const salesReplyClassificationLabels: Record<SalesReplyClassification, string> = {
  interested: "Intresserad",
  question: "Fråga",
  call_requested: "Vill bli uppringd",
  later: "Senare",
  not_interested: "Inte intresserad",
  wrong_number: "Fel nummer",
  stop: "STOPP",
};

export const defaultSalesCampaignMessage = "Hej {{companyName}}! Textback skickar automatiskt SMS när ni missar samtal. Ring {{demoNumber}} och lägg på för att testa själv. {{link}} /Textback. Svara STOPP.";

export function salesLeadStatusLabel(status: string) {
  return salesLeadStatusLabels[status as SalesLeadStatus] || status.replaceAll("_", " ");
}
