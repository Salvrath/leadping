import { describe, expect, it } from "vitest";
import { DEMO_SMS_MESSAGE, demoCooldownMinutes, demoDailyLimit } from "@/lib/server/telephony/demo-policy";

const env = (values: Record<string, string> = {}) => ({ NODE_ENV: "test", ...values } as NodeJS.ProcessEnv);

describe("demo number policy", () => {
  it("keeps the public demo SMS concise and linked", () => {
    expect(DEMO_SMS_MESSAGE).toContain("https://textback.se");
    expect(DEMO_SMS_MESSAGE.length).toBeLessThanOrEqual(160);
  });

  it("uses safe defaults and bounded overrides", () => {
    expect(demoCooldownMinutes(env())).toBe(360);
    expect(demoDailyLimit(env())).toBe(100);
    expect(demoCooldownMinutes(env({ TEXTBACK_DEMO_COOLDOWN_MINUTES: "120" }))).toBe(120);
    expect(demoDailyLimit(env({ TEXTBACK_DEMO_DAILY_LIMIT: "250" }))).toBe(250);
    expect(demoCooldownMinutes(env({ TEXTBACK_DEMO_COOLDOWN_MINUTES: "2" }))).toBe(360);
    expect(demoDailyLimit(env({ TEXTBACK_DEMO_DAILY_LIMIT: "99999" }))).toBe(100);
  });
});
