import "server-only";
import type { Lead } from "./lead-schema";
import { getSupabaseAdmin, hasSupabaseConfig } from "./server/supabase";

export type StoredLead = { id: string; email: string; company: string; stripe_customer_id?: string | null };
export interface LeadStorage {
  save(lead: Lead): Promise<StoredLead>;
  find(id: string): Promise<StoredLead | null>;
  update(id: string, values: Record<string, unknown>): Promise<void>;
}

export function mapLeadToRow(lead: Lead) {
  const acceptedAt = new Date().toISOString();
  return {
    company: lead.company,
    org_number: null,
    contact_name: lead.contact,
    email: lead.email,
    phone: lead.phone,
    workshop_phone: lead.businessPhone,
    telephony: lead.telephony,
    missed_calls_per_week: lead.missedCalls ?? 0,
    employees: 1,
    phone_numbers: lead.phoneNumbers,
    industry: lead.industry || null,
    message: lead.message || null,
    privacy_accepted_at: acceptedAt,
    authority_confirmed_at: acceptedAt,
    submission_id: lead.submissionId,
    utm_source: lead.utmSource || null,
    utm_medium: lead.utmMedium || null,
    utm_campaign: lead.utmCampaign || null,
    utm_content: lead.utmContent || null,
    utm_term: lead.utmTerm || null,
    landing_path: lead.landingPath || null,
    referrer: lead.referrer || null,
  };
}

export function leadSaveErrorCode(error: { code?: string } | null) {
  return error?.code === "23505" ? "DUPLICATE_SUBMISSION" : "LEAD_SAVE_FAILED";
}

export const supabaseLeadStorage: LeadStorage = {
  async save(lead) {
    const { data, error } = await getSupabaseAdmin()
      .from("pilot_leads")
      .insert(mapLeadToRow(lead))
      .select("id,email,company,stripe_customer_id")
      .single();
    if (error) throw new Error(leadSaveErrorCode(error));
    if (!data) throw new Error("LEAD_SAVE_FAILED");
    return data as StoredLead;
  },
  async find(id) {
    const { data, error } = await getSupabaseAdmin()
      .from("pilot_leads")
      .select("id,email,company,stripe_customer_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("LEAD_LOOKUP_FAILED");
    return data as StoredLead | null;
  },
  async update(id, values) {
    const { error } = await getSupabaseAdmin().from("pilot_leads").update(values).eq("id", id);
    if (error) throw new Error("LEAD_UPDATE_FAILED");
  },
};

const memory = new Map<string, StoredLead>();
export const developmentLeadStorage: LeadStorage = {
  async save(lead) {
    const row = { id: crypto.randomUUID(), email: lead.email, company: lead.company, stripe_customer_id: null };
    memory.set(row.id, row);
    console.info("[textback] enquiry stored", { id: row.id });
    return row;
  },
  async find(id) { return memory.get(id) || null; },
  async update(id, values) {
    const lead = memory.get(id);
    if (lead) memory.set(id, { ...lead, ...values });
  },
};

export function getLeadStorage(env: NodeJS.ProcessEnv = process.env): LeadStorage {
  if (hasSupabaseConfig(env)) return supabaseLeadStorage;
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return developmentLeadStorage;
  throw new Error("PERSISTENCE_NOT_CONFIGURED");
}
