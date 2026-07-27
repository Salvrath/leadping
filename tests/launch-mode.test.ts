import { describe, expect, it } from "vitest";
import { getLaunchMode, isCommerceEnabled } from "@/lib/launch-mode";

const env = (values: Record<string, string> = {}) => ({ NODE_ENV: "test", ...values }) as NodeJS.ProcessEnv;

describe("Textback launch mode", () => {
  it("defaults to demand validation", () => {
    expect(getLaunchMode(env())).toBe("validation");
    expect(isCommerceEnabled(env())).toBe(false);
  });

  it("requires an explicit commerce switch", () => {
    const commerce = env({ TEXTBACK_COMMERCE_ENABLED: "true" });
    expect(getLaunchMode(commerce)).toBe("commerce");
    expect(isCommerceEnabled(commerce)).toBe(true);
  });

  it("does not enable commerce for other values", () => {
    expect(getLaunchMode(env({ TEXTBACK_COMMERCE_ENABLED: "1" }))).toBe("validation");
    expect(getLaunchMode(env({ TEXTBACK_COMMERCE_ENABLED: "TRUE" }))).toBe("validation");
  });
});
