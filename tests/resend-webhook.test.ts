import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyResendWebhookSignature } from "@/lib/server/resend-webhook";

function signed(input: { payload: string; id: string; timestamp: string; secretBytes: Buffer }) {
  return createHmac("sha256", input.secretBytes)
    .update(`${input.id}.${input.timestamp}.${input.payload}`)
    .digest("base64");
}

describe("Resend webhook verification", () => {
  const now = new Date("2026-07-29T10:00:00Z");
  const timestamp = String(Math.floor(now.valueOf() / 1000));
  const id = "msg_test_event";
  const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "email_1" } });
  const secretBytes = Buffer.from("textback-webhook-test-secret");
  const secret = `whsec_${secretBytes.toString("base64")}`;

  it("accepts a valid v1 signature", () => {
    const signature = signed({ payload, id, timestamp, secretBytes });
    expect(verifyResendWebhookSignature({ payload, id, timestamp, signature: `v1,${signature}`, secret, now })).toBe(true);
  });

  it("rejects a modified payload", () => {
    const signature = signed({ payload, id, timestamp, secretBytes });
    expect(() => verifyResendWebhookSignature({ payload: `${payload}x`, id, timestamp, signature: `v1,${signature}`, secret, now })).toThrow("INVALID_WEBHOOK_SIGNATURE");
  });

  it("rejects stale events", () => {
    const oldTimestamp = String(Number(timestamp) - 301);
    const signature = signed({ payload, id, timestamp: oldTimestamp, secretBytes });
    expect(() => verifyResendWebhookSignature({ payload, id, timestamp: oldTimestamp, signature: `v1,${signature}`, secret, now })).toThrow("STALE_WEBHOOK_TIMESTAMP");
  });
});