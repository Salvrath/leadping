import "server-only";
import { timingSafeEqual } from "node:crypto";
import { siteUrl } from "@/lib/site";
import { normalizePhoneNumber } from "./number";
import type { IncomingCall, SmsResult } from "./types";

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyElksWebhook(request: Request): boolean {
  const expected = process.env.ELKS_WEBHOOK_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  const url = new URL(request.url);
  const supplied = request.headers.get("x-textback-webhook-secret") || url.searchParams.get("secret") || "";
  return secureEqual(supplied, expected);
}

export async function parseElksIncomingCall(request: Request): Promise<IncomingCall> {
  const contentType = request.headers.get("content-type") || "";
  let raw: Record<string, string>;
  if (contentType.includes("application/json")) {
    const json = await request.json() as Record<string, unknown>;
    raw = Object.fromEntries(Object.entries(json).map(([key, value]) => [key, String(value ?? "").slice(0, 500)]));
  } else {
    const form = await request.formData();
    raw = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value).slice(0, 500)]));
  }
  const providerCallId = raw.callid || raw.id;
  if (!providerCallId || providerCallId.length > 200) throw new Error("INVALID_CALL_ID");
  return {
    provider: "46elks",
    providerCallId,
    callerNumber: normalizePhoneNumber(raw.from),
    destinationNumber: normalizePhoneNumber(raw.to),
    createdAt: raw.created || undefined,
    raw,
  };
}

export async function sendElksSms(input: { from: string; to: string; message: string; eventId: string }): Promise<SmsResult> {
  const mode = process.env.TEXTBACK_SMS_MODE === "live" ? "live" : "log";
  if (mode === "log") {
    console.info("[textback:sms:log]", { to: input.to, from: input.from, eventId: input.eventId, length: input.message.length });
    return { mode, status: "logged" };
  }
  const username = process.env.ELKS_API_USERNAME;
  const password = process.env.ELKS_API_PASSWORD;
  if (!username || !password) throw new Error("SMS_PROVIDER_NOT_CONFIGURED");
  const body = new URLSearchParams({
    from: input.from,
    to: input.to,
    message: input.message,
    whendelivered: `${siteUrl}/api/telephony/46elks/sms-status?secret=${encodeURIComponent(process.env.ELKS_WEBHOOK_SECRET || "")}`,
  });
  const response = await fetch("https://api.46elks.com/a1/sms", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`SMS_PROVIDER_${response.status}`);
  const json = await response.json() as { id?: string; status?: string };
  if (!json.id) throw new Error("SMS_PROVIDER_INVALID_RESPONSE");
  return { mode, status: "created", providerId: json.id };
}

export const elksHangupResponse = { hangup: "busy" } as const;
