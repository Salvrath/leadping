import { afterEach, describe, expect, it } from "vitest";
import { getAdminAuthConfiguration } from "@/lib/server/admin-auth";

const originalPassword = process.env.TEXTBACK_ADMIN_PASSWORD;
const originalSecret = process.env.TEXTBACK_ADMIN_SECRET;

afterEach(() => {
  if (originalPassword === undefined) delete process.env.TEXTBACK_ADMIN_PASSWORD;
  else process.env.TEXTBACK_ADMIN_PASSWORD = originalPassword;

  if (originalSecret === undefined) delete process.env.TEXTBACK_ADMIN_SECRET;
  else process.env.TEXTBACK_ADMIN_SECRET = originalSecret;
});

describe("admin auth configuration", () => {
  it("reports missing or too-short credentials without exposing values", () => {
    process.env.TEXTBACK_ADMIN_PASSWORD = "too-short";
    process.env.TEXTBACK_ADMIN_SECRET = "also-too-short";

    expect(getAdminAuthConfiguration()).toEqual({
      configured: false,
      missing: ["TEXTBACK_ADMIN_PASSWORD", "TEXTBACK_ADMIN_SECRET"],
    });
  });

  it("accepts a password of at least 12 characters and a secret of at least 32 characters", () => {
    process.env.TEXTBACK_ADMIN_PASSWORD = "valid-password";
    process.env.TEXTBACK_ADMIN_SECRET = "x".repeat(32);

    expect(getAdminAuthConfiguration()).toEqual({ configured: true, missing: [] });
  });
});
