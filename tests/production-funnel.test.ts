import { describe, expect, it, vi } from "vitest";
import { getLeadStorage, mapLeadToRow, developmentLeadStorage } from "@/lib/lead-storage";
import type { Lead } from "@/lib/lead-schema";
import { filterAnalyticsProperties } from "@/lib/analytics";

const lead: Lead = {
  company:"Verkstaden",contact:"Kim",email:"kim@example.se",phone:"0700000000",workshopPhone:"080000000",
  telephony:"Telia",missedCalls:12,employees:4,privacy:true,authority:true,message:"Hej",
  submissionId:"00000000-0000-4000-8000-000000000001",formStartedAt:1,website:"",
  utmSource:"google",utmMedium:undefined,utmCampaign:undefined,utmContent:undefined,utmTerm:undefined,landingPath:"/?utm_source=google"
};

describe("production pilot funnel", () => {
  it("maps validated lead fields to database columns", () => {
    const row = mapLeadToRow(lead);
    expect(row).toMatchObject({company:"Verkstaden",contact_name:"Kim",missed_calls_per_week:12,submission_id:lead.submissionId,utm_source:"google"});
    expect(row).not.toHaveProperty("privacy");
  });
  it("never silently falls back to development storage in production", () => {
    expect(() => getLeadStorage({NODE_ENV:"production"} as NodeJS.ProcessEnv)).toThrow("PERSISTENCE_NOT_CONFIGURED");
  });
  it("development logging contains only the generated id", async () => {
    const log = vi.spyOn(console,"info").mockImplementation(()=>{});
    await developmentLeadStorage.save(lead);
    expect(JSON.stringify(log.mock.calls)).not.toContain(lead.email);
    expect(JSON.stringify(log.mock.calls)).not.toContain(lead.phone);
    log.mockRestore();
  });
  it("removes payment and identity fields from conversion payloads", () => {
    expect(filterAnalyticsProperties({product:"textback",stripe_customer_id:"cus_1",payment_intent:"pi_1",email:"a@b.se"})).toEqual({product:"textback"});
  });
});
