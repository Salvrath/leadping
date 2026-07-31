import { describe, expect, it } from "vitest";
import { evaluateSalesLead, selectDiverseLeads, type AssistantLead } from "@/lib/server/sales-assistant";

const settings = { auto_approve_verified: true, verification_max_age_days: 60, follow_up_after_days: 4 };
const baseLead: AssistantLead = {
  id: "11111111-1111-1111-1111-111111111111",
  company_name: "Test VVS AB",
  company_type: "aktiebolag",
  industry: "VVS",
  city: "Uppsala",
  contact_name: "Anna Andersson",
  contact_role: "VD",
  phone_number: "+46701234567",
  phone_contact_type: "direct_decision_maker",
  phone_source_url: "https://example.se/kontakt",
  decision_maker_verified: true,
  email_address: "anna@example.se",
  email_status: "verified",
  email_verified_at: "2026-07-20T10:00:00.000Z",
  email_source_url: "https://example.se/kontakt",
  source_url: "https://example.se/kontakt",
  verified_at: "2026-07-20T10:00:00.000Z",
  fit_score: 90,
  status: "review",
  do_not_contact: false,
  outbound_count: 0,
  last_contacted_at: null,
  last_reply_at: null,
  demo_called_at: null,
  website_clicked_at: null,
  next_follow_up_at: null,
  tracking_token: "22222222-2222-2222-2222-222222222222",
};

describe("assisted Sales Hub", () => {
  it("auto-approves a verified decision-maker contact without sending anything", () => {
    const result = evaluateSalesLead(baseLead, settings, new Set(), new Set(), new Date("2026-07-28T10:00:00.000Z"));
    expect(result.verificationStatus).toBe("ready");
    expect(result.nextStatus).toBe("approved");
    expect(result.recommendedAction).toBe("Lägg i SMS-utkast");
    expect(result.smsEligible).toBe(true);
    expect(result.emailEligible).toBe(true);
  });

  it("accepts a verified email-only lead but excludes it from SMS", () => {
    const result = evaluateSalesLead({
      ...baseLead,
      contact_name: "Mårten Persson",
      contact_role: "VD",
      phone_number: null,
      phone_contact_type: "none",
      phone_source_url: null,
      decision_maker_verified: false,
      status: "approved",
    }, settings, new Set(), new Set(), new Date("2026-07-28T10:00:00.000Z"));
    expect(result.verificationStatus).toBe("ready");
    expect(result.smsEligible).toBe(false);
    expect(result.emailEligible).toBe(true);
    expect(result.recommendedAction).toBe("Lägg i e-postutkast");
  });

  it("does not qualify a public company mobile without a named decision-maker", () => {
    const result = evaluateSalesLead({
      ...baseLead,
      contact_name: null,
      contact_role: null,
      phone_contact_type: "unverified_public",
      decision_maker_verified: false,
      email_address: null,
      email_status: "missing",
      email_verified_at: null,
      email_source_url: null,
    }, settings, new Set(), new Set(), new Date("2026-07-28T10:00:00.000Z"));
    expect(result.verificationStatus).toBe("needs_review");
    expect(result.smsEligible).toBe(false);
    expect(result.emailEligible).toBe(false);
    expect(result.reasons.join(" ")).toContain("direktnummer");
  });

  it("requires manual review when the source is stale", () => {
    const result = evaluateSalesLead({ ...baseLead, verified_at: "2026-01-01T10:00:00.000Z" }, settings, new Set(), new Set(), new Date("2026-07-28T10:00:00.000Z"));
    expect(result.verificationStatus).toBe("needs_review");
    expect(result.reasons.join(" ")).toContain("äldre än 60 dagar");
  });

  it("rejects suppressed and existing customer numbers", () => {
    const suppressed = evaluateSalesLead(baseLead, settings, new Set(), new Set([baseLead.phone_number!]), new Date("2026-07-28T10:00:00.000Z"));
    const customer = evaluateSalesLead(baseLead, settings, new Set([baseLead.phone_number!]), new Set(), new Date("2026-07-28T10:00:00.000Z"));
    expect(suppressed.verificationStatus).toBe("rejected");
    expect(customer.verificationStatus).toBe("rejected");
  });

  it("creates an SMS follow-up suggestion only for a qualified direct number after the due date", () => {
    const result = evaluateSalesLead({
      ...baseLead,
      status: "contacted",
      outbound_count: 1,
      last_contacted_at: "2026-07-20T10:00:00.000Z",
      next_follow_up_at: "2026-07-24T10:00:00.000Z",
    }, settings, new Set(), new Set(), new Date("2026-07-28T10:00:00.000Z"));
    expect(result.nextStatus).toBe("follow_up");
    expect(result.followUpTemplate).toContain("automatiskt SMS");
  });

  it("diversifies an automated draft across industries and cities", () => {
    const leads = Array.from({ length: 12 }, (_, index) => ({
      id: String(index),
      industry: index < 8 ? "VVS" : "El",
      city: index < 6 ? "Stockholm" : `Ort ${index}`,
      automationScore: 100 - index,
    }));
    const selected = selectDiverseLeads(leads, 6);
    expect(selected).toHaveLength(6);
    expect(new Set(selected.map((lead) => lead.industry)).size).toBeGreaterThan(1);
    expect(new Set(selected.map((lead) => lead.city)).size).toBeGreaterThan(2);
  });
});
