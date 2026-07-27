import { afterEach, describe, expect, it, vi } from "vitest";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalWebhookBaseUrl = process.env.TEXTBACK_WEBHOOK_BASE_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  if (originalWebhookBaseUrl === undefined) delete process.env.TEXTBACK_WEBHOOK_BASE_URL;
  else process.env.TEXTBACK_WEBHOOK_BASE_URL = originalWebhookBaseUrl;
  vi.resetModules();
});

describe("webhookBaseUrl", () => {
  it("uses the direct www host when the public site redirects from the apex domain", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://textback.se";
    delete process.env.TEXTBACK_WEBHOOK_BASE_URL;
    vi.resetModules();

    const { webhookBaseUrl } = await import("@/lib/site");

    expect(webhookBaseUrl).toBe("https://www.textback.se");
  });

  it("prefers an explicit non-redirecting webhook base URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://textback.se";
    process.env.TEXTBACK_WEBHOOK_BASE_URL = "https://hooks.example.com/";
    vi.resetModules();

    const { webhookBaseUrl } = await import("@/lib/site");

    expect(webhookBaseUrl).toBe("https://hooks.example.com");
  });
});
