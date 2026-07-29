import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

function secretBytes(secret: string) {
  const value = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  try {
    const decoded = Buffer.from(value, "base64");
    if (!decoded.length) throw new Error("EMPTY_SECRET");
    return decoded;
  } catch {
    throw new Error("INVALID_WEBHOOK_SECRET");
  }
}

function signatureCandidates(header: string) {
  return header
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(",", 2))
    .filter(([version, signature]) => version === "v1" && Boolean(signature))
    .map(([, signature]) => signature);
}

export function verifyResendWebhookSignature(input: {
  payload: string;
  id: string;
  timestamp: string;
  signature: string;
  secret: string;
  now?: Date;
  toleranceSeconds?: number;
}) {
  const timestamp = Number(input.timestamp);
  if (!Number.isInteger(timestamp)) throw new Error("INVALID_WEBHOOK_TIMESTAMP");
  const nowSeconds = Math.floor((input.now || new Date()).valueOf() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestamp) > tolerance) throw new Error("STALE_WEBHOOK_TIMESTAMP");

  const signedContent = `${input.id}.${input.timestamp}.${input.payload}`;
  const expected = createHmac("sha256", secretBytes(input.secret)).update(signedContent).digest();
  const candidates = signatureCandidates(input.signature);
  for (const candidate of candidates) {
    let received: Buffer;
    try { received = Buffer.from(candidate, "base64"); }
    catch { continue; }
    if (received.length === expected.length && timingSafeEqual(received, expected)) return true;
  }
  throw new Error("INVALID_WEBHOOK_SIGNATURE");
}