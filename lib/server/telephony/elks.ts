import "server-only";
import { timingSafeEqual } from "node:crypto";
import { siteUrl } from "@/lib/site";
import { normalizePhoneNumber } from "./number";
import type { IncomingCall, SmsMode, SmsResult } from "./types";

const ELKS_SMS_ENDPOINT = "https://api.46elks.com/a1/sms";
const REQUEST_TIMEOUT_MS = 8_000;

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
  if (raw.direction && raw.direction !== "incoming") throw new Error("INVALID_CALL_DIRECTION");
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

function smsMode(): SmsMode {
  const configured = process.env.TEXTBACK_SMS_MODE;
  return configured === "live" || configured === "dryrun" ? configured : "log";
}

export async function sendElksSms(input: { from: string; to: string; message: string; eventId: string }): Promise<SmsResult> {
  const mode = smsMode();
  if (mode === "log") {
    console.info("[textback:sms:log]", { to: input.to, from: input.from, eventId: input.eventId, length: input.message.length });
    return { mode, status: "logged" };
  }
  const username = process.env.ELKS_API_USERNAME;
  const password = process.env.ELKS_API_PASSWORD;
  const secret = process.env.ELKS_WEBHOOK_SECRET;
  if (!username || !password || !secret) throw new Error("SMS_PROVIDER_NOT_CONFIGURED");

  const body = new URLSearchParams({
    from: input.from,
    to: input.to,
    message: input.message,
    whendelivered: `${siteUrl}/api/telephony/46elks/sms-status?secret=${encodeURIComponent(secret)}`,
    dontlog: "message",
  });
  if (mode === "dryrun") body.set("dryrun", "yes");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(ELKS_SMS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`SMS_PROVIDER_${response.status}`);
    let json: { id?: string; status?: string; parts?: number; cost?: number; estimated_cost?: number };
    try { json = JSON.parse(text); } catch { throw new Error("SMS_PROVIDER_INVALID_JSON"); }
    if (mode === "live" && !json.id) throw new Error("SMS_PROVIDER_INVALID_RESPONSE");
    return {
      mode,
      status: "created",
      providerId: json.id,
      providerStatus: json.status,
      parts: json.parts,
      cost: json.cost ?? json.estimated_cost,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("SMS_PROVIDER_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const elksHangupResponse = { hangup: "busy" } as const;