import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "./supabase";

export type AuditActor = { type: "admin" | "customer" | "system"; id?: string | null };

function requestFingerprint(scope: string, subject?: string) {
  const h = headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || "unknown";
  const ua = h.get("user-agent") || "unknown";
  return createHash("sha256").update(`${scope}|${subject || ""}|${ip}|${ua}`).digest("hex");
}

export async function enforceRateLimit(options: {
  scope: string;
  subject?: string;
  limit: number;
  windowSeconds: number;
  blockSeconds: number;
}) {
  const key = `${options.scope}:${requestFingerprint(options.scope, options.subject)}`;
  const { data, error } = await getSupabaseAdmin().rpc("consume_rate_limit", {
    p_key: key,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
    p_block_seconds: options.blockSeconds,
  });
  if (error) throw new Error("RATE_LIMIT_CHECK_FAILED");
  if (data !== true) throw new Error("RATE_LIMITED");
}

export async function auditEvent(input: {
  actor: AuditActor;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const safeMetadata = { ...(input.metadata || {}) };
  delete safeMetadata.password;
  delete safeMetadata.password_hash;
  delete safeMetadata.secret;
  const { error } = await getSupabaseAdmin().from("audit_events").insert({
    actor_type: input.actor.type,
    actor_id: input.actor.id || null,
    action: input.action.slice(0, 120),
    target_type: input.targetType.slice(0, 120),
    target_id: input.targetId || null,
    metadata: safeMetadata,
  });
  if (error) console.error("[audit] write failed", { action: input.action, code: error.code });
}
