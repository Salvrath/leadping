import { describe, expect, it } from "vitest";
import { DEMO_SMS_MESSAGE, demoCooldownMinutes, demoDailyLimit } from "@/lib/server/telephony/demo-policy";

describe("demo number policy", () => {
  it("keeps the public demo SMS concise and linked", () => {
    expect(DEMO_SMS_MESSAGE).toContain("https://textback.se");
    expect(DEMO_SMS_MESSAGE.length).toBeLessThanOrEqual(160);
  });

  it("uses safe defaults and bounded overrides", () => {
    expect(demoCooldownMinutes({} as NodeJS.ProcessEnv)).toBe(360);
    expect(demoDailyLimit({} as NodeJS.ProcessEnv)).toBe(100);
    expect(demoCooldownMinutes({ TEXTBACK_DEMO_COOLDOWN_MINUTES: "120" } as NodeJS.ProcessEnv)).toBe(120);
    expect(demoDailyLimit({ TEXTBACK_DEMO_DAILY_LIMIT: "250" } as NodeJS.ProcessEnv)).toBe(250);
    expect(demoCooldownMinutes({ TEXTBACK_DEMO_COOLDOWN_MINUTES: "2" } as NodeJS.ProcessEnv)).toBe(360);
    expect(demoDailyLimit({ TEXTBACK_DEMO_DAILY_LIMIT: "99999" } as NodeJS.ProcessEnv)).toBe(100);
  });
});
