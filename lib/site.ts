function withoutTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export const siteUrl = withoutTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL || "https://textback.se");

const configuredWebhookBaseUrl = withoutTrailingSlash(process.env.TEXTBACK_WEBHOOK_BASE_URL || siteUrl);
export const webhookBaseUrl = configuredWebhookBaseUrl === "https://textback.se"
  ? "https://www.textback.se"
  : configuredWebhookBaseUrl;

export const siteName = "Textback";
