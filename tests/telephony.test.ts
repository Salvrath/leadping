import { describe, expect, it } from "vitest";
import { normalizePhoneNumber, samePhoneNumber } from "@/lib/server/telephony/number";

 describe("Textback telephony", () => {
  it("normalizes Swedish local and international numbers", () => {
    expect(normalizePhoneNumber("070-123 45 67")).toBe("+46701234567");
    expect(normalizePhoneNumber("0046701234567")).toBe("+46701234567");
    expect(normalizePhoneNumber("+46 70 123 45 67")).toBe("+46701234567");
  });

  it("rejects hidden and malformed caller ids", () => {
    expect(normalizePhoneNumber("anonymous")).toBeNull();
    expect(normalizePhoneNumber("123")).toBeNull();
    expect(normalizePhoneNumber("")).toBeNull();
  });

  it("compares normalized business numbers", () => {
    expect(samePhoneNumber("0701234567", "+46701234567")).toBe(true);
    expect(samePhoneNumber("0701234567", "+46709999999")).toBe(false);
  });
});
