import { describe, expect, it } from "vitest";
import {
  classifySalesEmail,
  defaultSalesEmailBody,
  defaultSalesEmailSubject,
  normalizeEmailAddress,
  renderSalesEmail,
} from "@/lib/server/sales-email";

describe("Sales Hub email", () => {
  it("normalizes and classifies generic company addresses", () => {
    expect(normalizeEmailAddress(" INFO@Example.SE ")).toBe("info@example.se");
    expect(classifySalesEmail("info@example.se")).toBe("generic");
    expect(classifySalesEmail("kontakt@example.se")).toBe("generic");
  });

  it("holds named work addresses for manual review", () => {
    expect(classifySalesEmail("anna.andersson@example.se")).toBe("personal");
    expect(classifySalesEmail("invalid")).toBe("unknown");
  });

  it("renders personalized tracked and unsubscribe links", () => {
    const result = renderSalesEmail({
      subjectTemplate: defaultSalesEmailSubject,
      bodyTemplate: defaultSalesEmailBody,
      companyName: "Test AB",
      leadTrackingToken: "11111111-1111-1111-1111-111111111111",
      recipientTrackingToken: "22222222-2222-2222-2222-222222222222",
      unsubscribeToken: "33333333-3333-3333-3333-333333333333",
    });
    expect(result.text).toContain("Test AB");
    expect(result.text).toContain("076-686 77 23");
    expect(result.link).toContain("email_recipient=22222222-2222-2222-2222-222222222222");
    expect(result.unsubscribeUrl).toContain("33333333-3333-3333-3333-333333333333");
    expect(result.html).toContain("Avregistrera adressen");
  });
});