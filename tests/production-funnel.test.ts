import { describe, expect, it, vi } from "vitest";
import { getLeadStorage, mapLeadToRow, developmentLeadStorage, leadSaveErrorCode } from "@/lib/lead-storage";
import { applicationErrorMessage } from "@/lib/application-errors";
import type { Lead } from "@/lib/lead-schema";
import { filterAnalyticsProperties } from "@/lib/analytics";

const lead: Lead = {
  company:"Serviceföretaget",contact:"Kim",email:"kim@example.se",phone:"0700000000",businessPhone:"080000000",
  phoneNumbers:3,telephony:"Telia",industry:"Hantverk",missedCalls:12,privacy:true,authority:true,message:"Hej",
  submissionId:"00000000-0000-4000-8000-000000000001",formStartedAt:1,website:"",
  utmSource:"google",utmMedium:undefined,utmCampaign:undefined,utmContent:undefined,utmTerm:undefined,
  gclid:"google-click-123",gbraid:undefined,wbraid:undefined,landingPath:"/?utm_source=google"
};

describe("production Textback funnel", () => {
  it("maps validated lead fields and Google click ids to database columns", () => {
    const row = mapLeadToRow(lead);
    expect(row).toMatchObject({company:"Serviceföretaget",contact_name:"Kim",missed_calls_per_week:12,phone_numbers:3,industry:"Hantverk",submission_id:lead.submissionId,utm_source:"google",gclid:"google-click-123"});
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
  it("maps unique submission conflicts to a stable user message", () => {
    expect(leadSaveErrorCode({code:"23505"})).toBe("DUPLICATE_SUBMISSION");
    expect(applicationErrorMessage(new Error("DUPLICATE_SUBMISSION"))).toBe("Ansökan har redan tagits emot.");
  });
});