import { describe, expect, it } from "vitest";
import { isRateLimitExceededError, RateLimitExceededError } from "@/lib/server/security";

describe("rate limit errors", () => {
  it("identifies controlled rate limit errors", () => {
    expect(isRateLimitExceededError(new RateLimitExceededError())).toBe(true);
    expect(isRateLimitExceededError(new Error("RATE_LIMITED"))).toBe(true);
  });

  it("does not classify unrelated errors as rate limits", () => {
    expect(isRateLimitExceededError(new Error("RATE_LIMIT_CHECK_FAILED"))).toBe(false);
    expect(isRateLimitExceededError("RATE_LIMITED")).toBe(false);
  });
});
