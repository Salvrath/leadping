import { describe, expect, it } from "vitest";
import { canProcessInactiveNumber } from "@/lib/server/telephony/process-missed-call";

describe("inactive number onboarding safety", () => {
  it("allows inactive numbers in non-sending test modes", () => {
    expect(canProcessInactiveNumber("dryrun")).toBe(true);
    expect(canProcessInactiveNumber("log")).toBe(true);
  });

  it("blocks inactive numbers in live mode", () => {
    expect(canProcessInactiveNumber("live")).toBe(false);
  });
});
