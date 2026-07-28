import { describe, expect, it } from "vitest";
import { evaluateSalesLead, selectDiverseLeads, type AssistantLead } from "@/lib/server/sales-assistant";

const settings = { auto_approve_verified: true, verification_max_age_days: 60, follow_up_after_days: 4 };
const baseLead: AssistantLead = {
  id: "11111111-1111-1111-1111-111111111111",
  company_name: "Test VVS AB",
  company_type: "aktiebolag",
  industry: "VVS",
  city: "Uppsala",
  phone_number: "+46701234567",
  source_url: "https://example.se/test",
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
  it("auto-approves a fresh verified AB lead without sending anything", () => {
    const result = evaluateSalesLead(baseLead, settings, new Set(), new Set(), new Date("2026-07-28T10:00:00.000Z"));
    expect(result.verificationStatus).toBe("ready");
    expect(result.nextStatus).toBe("approved");
    expect(result.recommendedAction).toBe("Lägg i kampanjutkast");
  });

  it("requires manual review when the source is stale", () => {
    const result = evaluateSalesLead({ ...baseLead, verified_at: "2026-01-01T10:00:00.000Z" }, settings, new Set(), new Set(), new Date("2026-07-28T10:00:00.000Z"));
    expect(result.verificationStatus).toBe("needs_review");
    expect(result.reasons.join(" ")).toContain("äldre än 60 dagar");
  });

  it("rejects suppressed and existing customer numbers", () => {
    const suppressed = evaluateSalesLead(baseLead, settings, new Set(), new Set([baseLead.phone_number]), new Date("2026-07-28T10:00:00.000Z"));
    const customer = evaluateSalesLead(baseLead, settings, new Set([baseLead.phone_number]), new Set(), new Date("2026-07-28T10:00:00.000Z"));
    expect(suppressed.verificationStatus).toBe("rejected");
    expect(customer.verificationStatus).toBe("rejected");
  });

  it("creates a follow-up suggestion only after the due date", () => {
    const result = evaluateSalesLead({
      ...baseLead,
      status: "contacted",
      outbound_count: 1,
      last_contacted_at: "2026-07-20T10:00:00.000Z",
      next_follow_up_at: "2026-07-24T10:00:00.000Z",
    }, settings, new Set(), new Set(), new Date("2026-07-28T10:00:00.000Z"));
    expect(result.nextStatus).toBe("follow_up");
    expect(result.followUpTemplate).toContain("Test VVS AB");
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