import { describe, expect, it } from "vitest";
import { defaultSalesCampaignMessage } from "@/lib/sales";
import {
  classifySalesReply,
  ensureSalesSmsCompliance,
  estimateSmsParts,
  isSalesSendWindow,
  parseSalesCsv,
  renderSalesMessage,
  salesShortCodeFromTrackingToken,
} from "@/lib/server/sales";
import { isLikelyLinkScanner, isValidSalesShortCode, isValidSalesTrackingToken } from "@/lib/sales-click-tracking";

describe("Sales Hub", () => {
  it("imports a named decision-maker with verified direct number", () => {
    const result = parseSalesCsv("företagsnamn;kontaktperson;roll;mobilnummer;nummertyp;beslutsfattare verifierad;bolagsform;källa;verifierad;fitscore\nTest AB;Anna Andersson;VD;070 123 45 67;direkt beslutsfattare;ja;Aktiebolag;https://example.se/kontakt;2026-07-28;88");
    expect(result.rejected).toHaveLength(0);
    expect(result.rows).toEqual([expect.objectContaining({
      companyName: "Test AB",
      contactName: "Anna Andersson",
      contactRole: "VD",
      phoneNumber: "+46701234567",
      phoneContactType: "direct_decision_maker",
      decisionMakerVerified: true,
      companyType: "aktiebolag",
      fitScore: 88,
    })]);
  });

  it("imports an email-only lead without inventing a phone number", () => {
    const result = parseSalesCsv("företagsnamn;kontaktperson;roll;e-post;bolagsform;e-postkälla;e-postverifierad\nTakbolaget AB;Mårten Persson;VD;marten@example.se;Aktiebolag;https://example.se/kontakt;2026-07-28");
    expect(result.rejected).toHaveLength(0);
    expect(result.rows[0]).toEqual(expect.objectContaining({
      companyName: "Takbolaget AB",
      phoneNumber: null,
      phoneContactType: "none",
      emailAddress: "marten@example.se",
      emailType: "personal",
    }));
  });

  it("rejects rows without a company or contact channel", () => {
    const missingCompany = parseSalesCsv("företagsnamn;mobilnummer\n;123");
    const missingChannel = parseSalesCsv("företagsnamn;mobilnummer;e-post\nTest AB;;");
    expect(missingCompany.rows).toHaveLength(0);
    expect(missingCompany.rejected[0]?.reason).toBe("Företagsnamn saknas.");
    expect(missingChannel.rows).toHaveLength(0);
    expect(missingChannel.rejected[0]?.reason).toBe("Giltigt telefonnummer eller e-postadress saknas.");
  });

  it("classifies opt-out and buying signals", () => {
    expect(classifySalesReply("STOPP")).toBe("stop");
    expect(classifySalesReply("Ring mig gärna i morgon")).toBe("call_requested");
    expect(classifySalesReply("Det låter bra, hur kommer vi igång?")).toBe("interested");
    expect(classifySalesReply("Inte just nu, återkom senare")).toBe("later");
  });

  it("always adds sender identity and opt-out copy", () => {
    expect(ensureSalesSmsCompliance("Hej, testa Textback")).toMatch(/\/Textback.*Svara STOPP\./);
  });

  it("generates a stable compact short code", () => {
    expect(salesShortCodeFromTrackingToken("01630c2c-c396-42a7-ba89-f28f59841538")).toBe("2BuJsqh");
    expect(isValidSalesShortCode("2BuJsqh")).toBe(true);
    expect(isValidSalesShortCode("0OIl123")).toBe(false);
  });

  it("renders the default campaign as one SMS part with demo number and short link", () => {
    const message = renderSalesMessage(defaultSalesCampaignMessage, {
      company_name: "Test AB",
      tracking_token: "01630c2c-c396-42a7-ba89-f28f59841538",
    }, "+46766867723");
    expect(message).toContain("076-686 77 23");
    expect(message).toContain("https://textback.se/x/2BuJsqh");
    expect(message).not.toContain("/t/");
    expect(message).toContain("Svara STOPP");
    expect(message.length).toBeLessThanOrEqual(160);
    expect(estimateSmsParts(message)).toBe(1);
  });

  it("calculates multipart SMS conservatively", () => {
    expect(estimateSmsParts("Kort SMS")).toBe(1);
    expect(estimateSmsParts("A".repeat(161))).toBe(2);
    expect(estimateSmsParts("🙂".repeat(71))).toBe(3);
  });

  it("limits cold sending to Swedish weekday business hours", () => {
    expect(isSalesSendWindow(new Date("2026-07-27T10:00:00Z"))).toBe(true);
    expect(isSalesSendWindow(new Date("2026-07-26T10:00:00Z"))).toBe(false);
  });

  it("accepts UUID tracking tokens and rejects malformed values", () => {
    expect(isValidSalesTrackingToken("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isValidSalesTrackingToken("not-a-token")).toBe(false);
  });

  it("classifies known preview agents and non-document requests as scanners", () => {
    expect(isLikelyLinkScanner({ userAgent: "Slackbot-LinkExpanding 1.0", secFetchDest: "document" })).toBe(true);
    expect(isLikelyLinkScanner({ userAgent: "Mozilla/5.0", secFetchDest: "image" })).toBe(true);
    expect(isLikelyLinkScanner({ userAgent: "Mozilla/5.0 (iPhone)", secFetchDest: "document" })).toBe(false);
  });
});
