import "server-only";

import { defaultSalesCampaignMessage } from "@/lib/sales";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { normalizePhoneNumber } from "@/lib/server/telephony/number";
import {
  estimatedSmsCostOre,
  estimateSmsParts,
  getSalesDemoNumber,
  renderSalesMessage,
} from "@/lib/server/sales";

export type SalesAutomationSettings = {
  paused: boolean;
  auto_approve_verified: boolean;
  auto_create_drafts: boolean;
  simulation_only: boolean;
  batch_size: number;
  min_draft_size: number;
  verification_max_age_days: number;
  follow_up_after_days: number;
};

export type AssistantLead = {
  id: string;
  company_name: string;
  company_type: string;
  industry: string | null;
  city: string | null;
  phone_number: string;
  source_url: string | null;
  verified_at: string | null;
  fit_score: number;
  status: string;
  do_not_contact: boolean;
  outbound_count: number;
  last_contacted_at: string | null;
  last_reply_at: string | null;
  demo_called_at: string | null;
  website_clicked_at: string | null;
  next_follow_up_at: string | null;
  tracking_token: string;
};

export type LeadEvaluation = {
  verificationStatus: "ready" | "needs_review" | "rejected";
  reasons: string[];
  automationScore: number;
  recommendedAction: string;
  recommendationReason: string;
  nextStatus: string;
  followUpTemplate: string | null;
  followUpSuggestedAt: string | null;
};

export type SalesAssistantSummary = {
  runId: string;
  dryRun: boolean;
  paused: boolean;
  evaluated: number;
  ready: number;
  needsReview: number;
  rejected: number;
  autoApproved: number;
  dueFollowUps: number;
  coldCandidates: number;
  coldDraftId: string | null;
  followUpDraftId: string | null;
  coldPreview: { id: string; companyName: string; industry: string | null; city: string | null; score: number }[];
  followUpPreview: { id: string; companyName: string; score: number }[];
};

const DAY = 24 * 60 * 60_000;
const followUpTemplate = "Hej igen {{companyName}}! Ville bara följa upp. Ring {{demoNumber}} och lägg på om ni vill uppleva hur Textback fångar ett missat samtal. {{link}} /Textback. Svara STOPP.";

export async function getSalesAutomationSettings(): Promise<SalesAutomationSettings> {
  const { data, error } = await getSupabaseAdmin().from("sales_automation_settings").select("paused,auto_approve_verified,auto_create_drafts,simulation_only,batch_size,min_draft_size,verification_max_age_days,follow_up_after_days").eq("id", true).maybeSingle();
  if (error) throw new Error("SALES_AUTOMATION_SETTINGS_FAILED");
  return data || {
    paused: false,
    auto_approve_verified: true,
    auto_create_drafts: true,
    simulation_only: false,
    batch_size: 20,
    min_draft_size: 5,
    verification_max_age_days: 60,
    follow_up_after_days: 4,
  };
}

export async function assertSalesOutboundEnabled() {
  const settings = await getSalesAutomationSettings();
  if (settings.paused) throw new Error("SALES_OUTBOUND_PAUSED");
  return settings;
}

function isHttpsUrl(value: string | null) {
  if (!value) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function suggestedFollowUp(companyName: string) {
  return followUpTemplate.replace("{{companyName}}", companyName);
}

export function evaluateSalesLead(
  lead: AssistantLead,
  settings: Pick<SalesAutomationSettings, "auto_approve_verified" | "verification_max_age_days" | "follow_up_after_days">,
  knownBusinessNumbers: Set<string>,
  suppressedNumbers: Set<string>,
  now = new Date(),
): LeadEvaluation {
  const reasons: string[] = [];
  const phone = normalizePhoneNumber(lead.phone_number);
  const verifiedAt = lead.verified_at ? new Date(lead.verified_at) : null;
  const ageDays = verifiedAt && !Number.isNaN(verifiedAt.valueOf()) ? Math.floor((now.valueOf() - verifiedAt.valueOf()) / DAY) : null;
  const suppressed = lead.do_not_contact || Boolean(phone && suppressedNumbers.has(phone));
  const knownCustomer = Boolean(phone && knownBusinessNumbers.has(phone));

  if (suppressed) reasons.push("Numret finns i spärrlistan.");
  if (knownCustomer) reasons.push("Numret används redan av ett Textback-företag.");
  if (!phone || !phone.startsWith("+467")) reasons.push("Ett verifierat svenskt mobilnummer saknas.");
  if (lead.company_type !== "aktiebolag") reasons.push("Bolagsformen är inte verifierad som aktiebolag.");
  if (!isHttpsUrl(lead.source_url)) reasons.push("En giltig HTTPS-källa saknas.");
  if (ageDays === null) reasons.push("Verifieringsdatum saknas.");
  else if (ageDays > settings.verification_max_age_days) reasons.push(`Källkontrollen är äldre än ${settings.verification_max_age_days} dagar.`);

  const rejected = suppressed || knownCustomer || !phone;
  const ready = !rejected && reasons.length === 0;
  const verificationStatus: LeadEvaluation["verificationStatus"] = rejected ? "rejected" : ready ? "ready" : "needs_review";
  let score = Math.max(0, Math.min(100, lead.fit_score || 0));
  if (ready) score = Math.min(100, score + 5);
  score += lead.demo_called_at ? 15 : 0;
  score += lead.last_reply_at ? 15 : 0;
  score += lead.website_clicked_at ? 8 : 0;
  score -= Math.min(20, reasons.length * 5);
  score = Math.max(0, Math.min(100, score));

  const dueAt = lead.next_follow_up_at ? new Date(lead.next_follow_up_at) : null;
  const coldFollowUpDue = lead.outbound_count === 1 && !lead.last_reply_at && !lead.demo_called_at && !lead.website_clicked_at && dueAt && dueAt <= now;
  let recommendedAction = "Avvakta";
  let recommendationReason = "Ingen åtgärd krävs just nu.";
  let nextStatus = lead.status;
  let template: string | null = null;
  let suggestedAt: string | null = null;

  if (rejected) {
    recommendedAction = "Ingen kontakt";
    recommendationReason = reasons.join(" ");
    nextStatus = lead.do_not_contact ? "blocked" : "invalid";
  } else if (!ready) {
    recommendedAction = "Kontrollera uppgifterna";
    recommendationReason = reasons.join(" ");
    if (!["contacted", "engaged", "demo_tested", "replied", "interested", "converted"].includes(lead.status)) nextStatus = "review";
  } else if (lead.status === "interested" || lead.last_reply_at) {
    recommendedAction = "Svara idag";
    recommendationReason = "Företaget har svarat och ska prioriteras manuellt.";
  } else if (lead.demo_called_at) {
    recommendedAction = "Följ upp demosamtalet";
    recommendationReason = "Företaget har testat demon och är en stark köpsignal.";
    if (lead.status !== "converted") nextStatus = "demo_tested";
  } else if (lead.website_clicked_at) {
    recommendedAction = "Prioritera uppföljning";
    recommendationReason = "Företaget har öppnat den spårade länken.";
    if (lead.status === "contacted") nextStatus = "engaged";
  } else if (coldFollowUpDue) {
    recommendedAction = "Granska uppföljningsutkast";
    recommendationReason = "Första SMS:et har inte gett någon aktivitet och uppföljningsdatumet har passerat.";
    nextStatus = "follow_up";
    template = suggestedFollowUp(lead.company_name);
    suggestedAt = now.toISOString();
  } else if (lead.outbound_count >= 2) {
    recommendedAction = "Avsluta kall sekvens";
    recommendationReason = "Två kalla SMS har skickats utan en tydlig signal.";
  } else if (lead.status === "review" && settings.auto_approve_verified) {
    recommendedAction = "Lägg i kampanjutkast";
    recommendationReason = "Leadet klarar alla automatiska kontroller och kan förberedas för manuell utskicksgranskning.";
    nextStatus = "approved";
  } else if (lead.status === "approved") {
    recommendedAction = "Lägg i kampanjutkast";
    recommendationReason = "Leadet är verifierat och godkänt men har inte kontaktats.";
  }

  return {
    verificationStatus,
    reasons,
    automationScore: score,
    recommendedAction,
    recommendationReason,
    nextStatus,
    followUpTemplate: template,
    followUpSuggestedAt: suggestedAt,
  };
}

export function selectDiverseLeads<T extends { industry: string | null; city: string | null; automationScore: number }>(leads: T[], limit: number) {
  const selected: T[] = [];
  const industryCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();
  const sorted = [...leads].sort((a, b) => b.automationScore - a.automationScore);
  for (const lead of sorted) {
    const industry = lead.industry || "Övrigt";
    const city = lead.city || "Okänd ort";
    const industryLimit = Math.max(2, Math.ceil(limit / 4));
    const cityLimit = Math.max(1, Math.ceil(limit / 6));
    if ((industryCounts.get(industry) || 0) >= industryLimit) continue;
    if ((cityCounts.get(city) || 0) >= cityLimit) continue;
    selected.push(lead);
    industryCounts.set(industry, (industryCounts.get(industry) || 0) + 1);
    cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
    if (selected.length >= limit) break;
  }
  if (selected.length < limit) {
    for (const lead of sorted) {
      if (selected.includes(lead)) continue;
      selected.push(lead);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

async function createAssistedDraft(input: {
  runId: string;
  type: "cold_outreach" | "follow_up";
  leads: Array<AssistantLead & { automationScore: number }>;
  template: string;
  name: string;
}) {
  if (!input.leads.length) return null;
  const db = getSupabaseAdmin();
  const demo = await getSalesDemoNumber();
  const recipients = input.leads.map((lead) => {
    const rendered = renderSalesMessage(input.template, lead, demo.provider_number);
    const parts = estimateSmsParts(rendered);
    return { lead, rendered, parts, cost: estimatedSmsCostOre(parts) };
  });
  const { data: campaign, error } = await db.from("sales_campaigns").insert({
    name: input.name,
    textback_number_id: demo.id,
    message_template: input.template,
    recipient_count: recipients.length,
    estimated_parts: recipients.reduce((sum, item) => sum + item.parts, 0),
    estimated_cost_ore: recipients.reduce((sum, item) => sum + item.cost, 0),
    created_by_mode: "assisted",
    automation_type: input.type,
    automation_run_id: input.runId,
    simulation_snapshot: { selected: recipients.map((item) => ({ lead_id: item.lead.id, score: item.lead.automationScore })) },
  }).select("id").single();
  if (error || !campaign) throw new Error("SALES_ASSISTED_CAMPAIGN_CREATE_FAILED");
  const { error: recipientError } = await db.from("sales_campaign_recipients").insert(recipients.map(({ lead, rendered, parts, cost }) => ({
    campaign_id: campaign.id,
    sales_lead_id: lead.id,
    rendered_message: rendered,
    estimated_parts: parts,
    estimated_cost_ore: cost,
  })));
  if (recipientError) throw new Error("SALES_ASSISTED_RECIPIENT_CREATE_FAILED");
  return campaign.id as string;
}

export async function runSalesAssistant(input: { dryRun: boolean; source: "admin" | "cron" | "import" }): Promise<SalesAssistantSummary> {
  const db = getSupabaseAdmin();
  const settings = await getSalesAutomationSettings();
  const effectiveDryRun = input.dryRun || settings.simulation_only;
  const { data: run, error: runError } = await db.from("sales_automation_runs").insert({ source: input.source, dry_run: effectiveDryRun, status: "running" }).select("id").single();
  if (runError || !run) throw new Error("SALES_AUTOMATION_RUN_CREATE_FAILED");

  try {
    const [{ data: leads, error: leadError }, { data: numbers }, { data: suppressions }, { data: openCampaigns }] = await Promise.all([
      db.from("sales_leads").select("id,company_name,company_type,industry,city,phone_number,source_url,verified_at,fit_score,status,do_not_contact,outbound_count,last_contacted_at,last_reply_at,demo_called_at,website_clicked_at,next_follow_up_at,tracking_token").limit(1000),
      db.from("textback_numbers").select("provider_number,business_phone_numbers"),
      db.from("sales_suppressions").select("phone_number"),
      db.from("sales_campaigns").select("id,status,created_by_mode,automation_type").in("status", ["draft", "sending"]),
    ]);
    if (leadError) throw new Error("SALES_AUTOMATION_LEADS_FAILED");
    const knownBusinessNumbers = new Set<string>();
    for (const number of numbers || []) {
      const provider = normalizePhoneNumber(number.provider_number);
      if (provider) knownBusinessNumbers.add(provider);
      for (const phone of number.business_phone_numbers || []) {
        const normalized = normalizePhoneNumber(phone);
        if (normalized) knownBusinessNumbers.add(normalized);
      }
    }
    const suppressedNumbers = new Set((suppressions || []).map((item) => normalizePhoneNumber(item.phone_number)).filter(Boolean) as string[]);
    const now = new Date();
    const evaluated = (leads || []).map((lead) => ({
      lead: lead as AssistantLead,
      evaluation: evaluateSalesLead(lead as AssistantLead, settings, knownBusinessNumbers, suppressedNumbers, now),
    }));

    const ready = evaluated.filter((item) => item.evaluation.verificationStatus === "ready");
    const needsReview = evaluated.filter((item) => item.evaluation.verificationStatus === "needs_review");
    const rejected = evaluated.filter((item) => item.evaluation.verificationStatus === "rejected");
    const autoApproved = evaluated.filter((item) => item.lead.status === "review" && item.evaluation.nextStatus === "approved");
    const dueFollowUps = evaluated.filter((item) => item.evaluation.followUpTemplate);

    if (!effectiveDryRun) {
      const updateResults = await Promise.all(evaluated.map(({ lead, evaluation }) => db.from("sales_leads").update({
        verification_status: evaluation.verificationStatus,
        verification_reasons: evaluation.reasons,
        verified_by_system_at: evaluation.verificationStatus === "ready" ? now.toISOString() : null,
        automation_score: evaluation.automationScore,
        recommended_action: evaluation.recommendedAction,
        recommendation_reason: evaluation.recommendationReason,
        automation_updated_at: now.toISOString(),
        follow_up_template: evaluation.followUpTemplate,
        follow_up_suggested_at: evaluation.followUpSuggestedAt,
        status: evaluation.nextStatus,
        updated_at: now.toISOString(),
      }).eq("id", lead.id)));
      if (updateResults.some((result) => result.error)) throw new Error("SALES_AUTOMATION_UPDATE_FAILED");
    }

    const openIds = (openCampaigns || []).map((campaign) => campaign.id);
    const openRecipientResult = openIds.length
      ? await db.from("sales_campaign_recipients").select("sales_lead_id").in("campaign_id", openIds)
      : { data: [] as { sales_lead_id: string }[], error: null };
    if (openRecipientResult.error) throw new Error("SALES_AUTOMATION_RECIPIENT_LOOKUP_FAILED");
    const alreadyQueued = new Set((openRecipientResult.data || []).map((item) => item.sales_lead_id));

    const coldPool = evaluated
      .filter(({ lead, evaluation }) => evaluation.verificationStatus === "ready" && evaluation.nextStatus === "approved" && lead.outbound_count === 0 && !alreadyQueued.has(lead.id))
      .map(({ lead, evaluation }) => ({ ...lead, automationScore: evaluation.automationScore }));
    const followUpPool = evaluated
      .filter(({ lead, evaluation }) => Boolean(evaluation.followUpTemplate) && !alreadyQueued.has(lead.id))
      .map(({ lead, evaluation }) => ({ ...lead, automationScore: evaluation.automationScore }));
    const coldSelected = selectDiverseLeads(coldPool, settings.batch_size);
    const followUpSelected = selectDiverseLeads(followUpPool, settings.batch_size);

    let coldDraftId: string | null = null;
    let followUpDraftId: string | null = null;
    const hasColdDraft = (openCampaigns || []).some((campaign) => campaign.created_by_mode === "assisted" && campaign.automation_type === "cold_outreach" && campaign.status === "draft");
    const hasFollowUpDraft = (openCampaigns || []).some((campaign) => campaign.created_by_mode === "assisted" && campaign.automation_type === "follow_up" && campaign.status === "draft");
    const canCreate = !effectiveDryRun && !settings.paused && settings.auto_create_drafts;
    if (canCreate && !hasColdDraft && coldSelected.length >= settings.min_draft_size) {
      coldDraftId = await createAssistedDraft({
        runId: run.id,
        type: "cold_outreach",
        leads: coldSelected,
        template: defaultSalesCampaignMessage,
        name: `Assisterat kampanjutkast ${new Intl.DateTimeFormat("sv-SE").format(now)}`,
      });
    }
    if (canCreate && !hasFollowUpDraft && followUpSelected.length > 0) {
      followUpDraftId = await createAssistedDraft({
        runId: run.id,
        type: "follow_up",
        leads: followUpSelected,
        template: followUpTemplate,
        name: `Assisterad uppföljning ${new Intl.DateTimeFormat("sv-SE").format(now)}`,
      });
    }

    const summary: SalesAssistantSummary = {
      runId: run.id,
      dryRun: effectiveDryRun,
      paused: settings.paused,
      evaluated: evaluated.length,
      ready: ready.length,
      needsReview: needsReview.length,
      rejected: rejected.length,
      autoApproved: autoApproved.length,
      dueFollowUps: dueFollowUps.length,
      coldCandidates: coldPool.length,
      coldDraftId,
      followUpDraftId,
      coldPreview: coldSelected.map((lead) => ({ id: lead.id, companyName: lead.company_name, industry: lead.industry, city: lead.city, score: lead.automationScore })),
      followUpPreview: followUpSelected.map((lead) => ({ id: lead.id, companyName: lead.company_name, score: lead.automationScore })),
    };
    await db.from("sales_automation_runs").update({ status: settings.paused ? "paused" : "completed", summary, completed_at: new Date().toISOString() }).eq("id", run.id);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "UNKNOWN";
    await db.from("sales_automation_runs").update({ status: "failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", run.id);
    throw error;
  }
}