export const salesTrackingTokenPattern = /^[0-9a-f-]{36}$/i;
export const salesShortCodePattern = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{5}$/;

const scannerPattern = /(bot|crawler|spider|preview|prefetch|safebrowsing|urlscan|linkcheck|linkexpander|facebookexternalhit|whatsapp|slackbot|telegrambot|discordbot|skypeuripreview|proofpoint|barracuda|mimecast|symantec|trendmicro|googleimageproxy|outlook|office existence discovery)/i;

export function isValidSalesTrackingToken(token: string) {
  return salesTrackingTokenPattern.test(token);
}

export function isValidSalesShortCode(code: string) {
  return salesShortCodePattern.test(code);
}

export function isLikelyLinkScanner(input: {
  userAgent?: string | null;
  secFetchDest?: string | null;
}) {
  const userAgent = input.userAgent || "";
  if (!userAgent || scannerPattern.test(userAgent)) return true;
  if (input.secFetchDest && !["document", "empty"].includes(input.secFetchDest)) return true;
  return false;
}
