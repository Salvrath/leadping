import { describe, expect, it } from "vitest";
import { getLaunchMode, isCommerceEnabled } from "@/lib/launch-mode";

describe("Textback launch mode", () => {
  it("defaults to demand validation", () => {
    expect(getLaunchMode({} as NodeJS.ProcessEnv)).toBe("validation");
    expect(isCommerceEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("requires an explicit commerce switch", () => {
    const env = { TEXTBACK_COMMERCE_ENABLED: "true" } as NodeJS.ProcessEnv;
    expect(getLaunchMode(env)).toBe("commerce");
    expect(isCommerceEnabled(env)).toBe(true);
  });

  it("does not enable commerce for other values", () => {
    expect(getLaunchMode({ TEXTBACK_COMMERCE_ENABLED: "1" } as NodeJS.ProcessEnv)).toBe("validation");
    expect(getLaunchMode({ TEXTBACK_COMMERCE_ENABLED: "TRUE" } as NodeJS.ProcessEnv)).toBe("validation");
  });
});
