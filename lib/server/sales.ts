import "server-only";

import { siteUrl } from "@/lib/site";
import { type SalesReplyClassification } from "@/lib/sales";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { normalizePhoneNumber } from "@/lib/server/telephony/number";

const SALES_SMS_COST_ORE = 52;
const SALES_BATCH_LIMIT = 20;
const SALES_DAILY_LIMIT = 50;

export type ImportedSalesLead = {
  companyName: string;
  organizationNumber: string | null;
  companyType: "aktiebolag" | "other_legal_entity" | "sole_trader" | "unknown";
  industry: string | null;
  city: string | null;
  contactName: string | null;
  phoneNumber: string;
  sourceUrl: string | null;
  sourceNotes: string | null;
  verifiedAt: string | null;
  fitScore: number;
  fitReason: string | null;
  tags: string[];
};

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      cells.push(cell.trim()); cell = "";
    } else cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function normalizedHeader(value: string) {
  return value.trim().toLocaleLowerCase("sv-SE").replace(/[\s_-]+/g, "");
}

function pick(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalizedHeader(alias)];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function companyType(value: string): ImportedSalesLead["companyType"] {
  const normalized = value.toLocaleLowerCase("sv-SE");
  if (/\b(ab|aktiebolag)\b/.test(normalized)) return "aktiebolag";
  if (/enskild|ensk firma|enskild firma/.test(normalized)) return "sole_trader";
  if (/handelsbolag|kommanditbolag|ekonomisk förening|juridisk/.test(normalized)) return "other_legal_entity";
  return "unknown";
}

function safeDate(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

export function parseSalesCsv(input: string): { rows: ImportedSalesLead[]; rejected: { row: number; reason: string }[] } {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], rejected: [{ row: 1, reason: "CSV-filen saknar data." }] };
  const delimiter = (lines[0].match(/;/g)?.length || 0) >= (lines[0].match(/,/g)?.length || 0) ? ";" : ",";
  const headers = parseDelimitedLine(lines[0], delimiter).map(normalizedHeader);
  const rows: ImportedSalesLead[] = [];
  const rejected: { row: number; reason: string }[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseDelimitedLine(lines[index], delimiter);
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ""]));
    const companyName = pick(row, ["företagsnamn", "foretagsnamn", "company", "companyname", "namn"]);
    const rawPhone = pick(row, ["mobilnummer", "telefonnummer", "telefon", "phone", "mobile"]);
    const phoneNumber = normalizePhoneNumber(rawPhone);
    if (!companyName || !phoneNumber) {
      rejected.push({ row: index + 1, reason: !companyName ? "Företagsnamn saknas." : "Telefonnumret är ogiltigt." });
      continue;
    }
    const rawFit = Number(pick(row, ["fitscore", "poäng", "poang", "score"]) || 50);
    rows.push({
      companyName: companyName.slice(0, 160),
      organizationNumber: pick(row, ["organisationsnummer", "orgnummer", "orgnr", "organizationnumber"]) || null,
      companyType: companyType(pick(row, ["bolagsform", "companytype", "företagsform", "foretagsform"])),
      industry: pick(row, ["bransch", "industry"]) || null,
      city: pick(row, ["ort", "stad", "city"]) || null,
      contactName: pick(row, ["kontaktperson", "contact", "contactname"]) || null,
      phoneNumber,
      sourceUrl: pick(row, ["källa", "kalla", "source", "sourceurl", "url"]) || null,
      sourceNotes: pick(row, ["källanteckning", "kallanteckning", "sourcenotes"]) || null,
      verifiedAt: safeDate(pick(row, ["verifierad", "verifieringsdatum", "verifiedat"])),
      fitScore: Math.max(0, Math.min(100, Number.isFinite(rawFit) ? Math.round(rawFit) : 50)),
      fitReason: pick(row, ["fitreason", "motivering", "produktpassning"]) || null,
      tags: pick(row, ["taggar", "tags"]).split(/[|,]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    });
  }
  return { rows, rejected };
}

export function classifySalesReply(message: string): SalesReplyClassification {
  const normalized = message.trim().toLocaleLowerCase("sv-SE");
  if (/^(stopp|stop|avregistrera|sluta)(\b|!|\.)/.test(normalized)) return "stop";
  if (/fel nummer|fel person|inte vårt nummer|har slutat/.test(normalized)) return "wrong_number";
  if (/ring mig|ring gärna|kan ni ringa|slå en signal/.test(normalized)) return "call_requested";
  if (/inte intresser|nej tack|inga tack|vill inte/.test(normalized)) return "not_interested";
  if (/senare|inte just nu|återkom|hör av.*(senare|nästa)/.test(normalized)) return "later";
  if (/intresser|ja tack|berätta mer|låter bra|hur kommer vi igång|ansluta/.test(normalized)) return "interested";
  return "question";
}

export function suggestedSalesReply(classification: SalesReplyClassification, companyName: string) {
  const replies: Record<SalesReplyClassification, string> = {
    interested: `Hej! Bra. Jag hjälper gärna ${companyName} att komma igång med Textback. Vilket nummer vill ni ansluta? /Textback`,
    question: "Hej! Absolut. Skriv gärna vad ni undrar så svarar vi här, eller ring demonumret 076-686 77 23 för att testa tjänsten direkt. /Textback",
    call_requested: "Hej! Vi ringer upp er. Skriv gärna vilken tid som passar bäst. /Textback",
    later: "Tack, då återkommer vi längre fram. Svara STOPP om ni inte vill få någon uppföljning. /Textback",
    not_interested: "Tack för beskedet. Vi avslutar kontakten. /Textback",
    wrong_number: "Tack för att du sa till. Numret spärras från fler utskick. /Textback",
    stop: "Bekräftat. Numret har spärrats från fler utskick från Textback.",
  };
  return replies[classification];
}

export function ensureSalesSmsCompliance(message: string) {
  let result = message.trim();
  if (!/\/\s*textback\b/i.test(result)) result += " /Textback";
  if (!/svara\s+stopp/i.test(result)) result += ". Svara STOPP.";
  return result.replace(/\s+/g, " ").slice(0, 1000);
}

export function salesTrackedLink(lead: { short_code?: string | null; tracking_token?: string | null }) {
  if (lead.short_code) return `${siteUrl}/x/${lead.short_code}`;
  if (lead.tracking_token) return `${siteUrl}/t/${lead.tracking_token}`;
  throw new Error("SALES_TRACKING_LINK_UNAVAILABLE");
}

export function renderSalesMessage(template: string, lead: { company_name: string; tracking_token?: string | null; short_code?: string | null }, demoNumber: string) {
  const link = salesTrackedLink(lead);
  return ensureSalesSmsCompliance(template
    .replaceAll("{{companyName}}", lead.company_name)
    .replaceAll("{{demoNumber}}", displayPhone(demoNumber))
    .replaceAll("{{link}}", link));
}

export function salesDemoMessage(lead: { company_name: string; tracking_token?: string | null; short_code?: string | null }) {
  return `Hej! Nu har ${lead.company_name} testat Textback. Så här fångas missade samtal automatiskt. Svara här om ni vill ansluta eller har frågor. ${salesTrackedLink(lead)} /Textback`;
}

export function displayPhone(value: string) {
  if (/^\+467\d{8}$/.test(value)) return `0${value.slice(3, 5)}-${value.slice(5, 8)} ${value.slice(8, 10)} ${value.slice(10)}`;
  return value;
}

const gsmBasic = new Set(("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà").split(""));
const gsmExtended = new Set("^{}\\[~]|€".split(""));

export function estimateSmsParts(message: string) {
  let units = 0;
  let gsm = true;
  for (const character of message) {
    if (gsmBasic.has(character)) units += 1;
    else if (gsmExtended.has(character)) units += 2;
    else { gsm = false; break; }
  }
  if (!gsm) return message.length <= 70 ? 1 : Math.ceil(message.length / 67);
  return units <= 160 ? 1 : Math.ceil(units / 153);
}

export function estimatedSmsCostOre(parts: number) {
  const configured = Number(process.env.TEXTBACK_SALES_SMS_COST_ORE || SALES_SMS_COST_ORE);
  return parts * (Number.isFinite(configured) && configured > 0 ? Math.round(configured) : SALES_SMS_COST_ORE);
}

export function salesBatchLimit() {
  const configured = Number(process.env.TEXTBACK_SALES_BATCH_LIMIT || SALES_BATCH_LIMIT);
  return Number.isFinite(configured) ? Math.max(1, Math.min(50, Math.floor(configured))) : SALES_BATCH_LIMIT;
}

export function salesDailyLimit() {
  const configured = Number(process.env.TEXTBACK_SALES_DAILY_LIMIT || SALES_DAILY_LIMIT);
  return Number.isFinite(configured) ? Math.max(1, Math.min(500, Math.floor(configured))) : SALES_DAILY_LIMIT;
}

export function isSalesSendWindow(date = new Date()) {
  if (process.env.TEXTBACK_SALES_ENFORCE_SEND_WINDOW === "false") return true;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return !["Sat", "Sun"].includes(weekday || "") && hour >= 8 && hour < 18;
}

export async function getSalesDemoNumber() {
  const { data, error } = await getSupabaseAdmin().from("textback_numbers")
    .select("id,provider,provider_number,active,demo_mode")
    .eq("provider", "46elks").eq("demo_mode", true).eq("active", true).limit(1).maybeSingle();
  if (error) throw new Error("SALES_DEMO_NUMBER_LOOKUP_FAILED");
  if (!data) throw new Error("SALES_DEMO_NUMBER_UNAVAILABLE");
  return data;
}

export async function remainingSalesDailyCapacity() {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count, error } = await getSupabaseAdmin().from("sales_messages")
    .select("id", { count: "exact", head: true }).eq("direction", "outbound").gte("created_at", since.toISOString());
  if (error) throw new Error("SALES_DAILY_LIMIT_LOOKUP_FAILED");
  return Math.max(0, salesDailyLimit() - (count || 0));
}
