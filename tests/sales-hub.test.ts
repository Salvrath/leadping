import { describe, expect, it } from "vitest";
import {
  classifySalesReply,
  ensureSalesSmsCompliance,
  estimateSmsParts,
  isSalesSendWindow,
  parseSalesCsv,
  renderSalesMessage,
} from "@/lib/server/sales";

describe("Sales Hub", () => {
  it("imports semicolon separated Swedish lead data and normalizes phone numbers", () => {
    const result = parseSalesCsv("företagsnamn;mobilnummer;bolagsform;källa;verifierad;fitscore\nTest AB;070 123 45 67;Aktiebolag;https://example.se;2026-07-28;88");
    expect(result.rejected).toHaveLength(0);
    expect(result.rows).toEqual([expect.objectContaining({ companyName: "Test AB", phoneNumber: "+46701234567", companyType: "aktiebolag", fitScore: 88 })]);
  });

  it("rejects rows without a valid company or phone number", () => {
    const result = parseSalesCsv("företagsnamn;mobilnummer\n;123");
    expect(result.rows).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe("Företagsnamn saknas.");
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

  it("renders personalized demo number and tracked link", () => {
    const message = renderSalesMessage("Hej {{companyName}}. Ring {{demoNumber}}. {{link}}", { company_name: "Test AB", tracking_token: "11111111-1111-1111-1111-111111111111" }, "+46766867723");
    expect(message).toContain("Test AB");
    expect(message).toContain("076-686 77 23");
    expect(message).toContain("/t/11111111-1111-1111-1111-111111111111");
    expect(message).toContain("Svara STOPP");
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
});
