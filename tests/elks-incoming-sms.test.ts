import { describe, expect, it } from "vitest";
import { parseElksIncomingSms } from "@/lib/server/telephony/elks";

describe("46elks inbound SMS", () => {
  it("normalizes a valid Swedish inbound reply", async () => {
    const body = new URLSearchParams({
      id: "sms-test-1",
      from: "0701234567",
      to: "+46709998877",
      message: "Hej, jag vill boka en tid.",
      created: "2026-07-25T12:00:00Z",
    });
    const request = new Request("https://textback.se/api/telephony/46elks/incoming-sms", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const sms = await parseElksIncomingSms(request);
    expect(sms.providerMessageId).toBe("sms-test-1");
    expect(sms.senderNumber).toBe("+46701234567");
    expect(sms.destinationNumber).toBe("+46709998877");
    expect(sms.message).toBe("Hej, jag vill boka en tid.");
  });

  it("rejects empty messages", async () => {
    const request = new Request("https://textback.se/api/telephony/46elks/incoming-sms", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id: "sms-test-2", from: "+46701234567", to: "+46709998877", message: "" }),
    });
    await expect(parseElksIncomingSms(request)).rejects.toThrow("INVALID_SMS_MESSAGE");
  });
});
