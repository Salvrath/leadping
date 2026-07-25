import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";

export type IncidentInput = {
  source: "telephony" | "sms" | "stripe" | "webhook" | "system";
  severity: "warning" | "critical";
  code: string;
  summary: string;
  context?: Record<string, unknown>;
};

function fingerprint(input: IncidentInput) {
  return createHash("sha256").update(`${input.source}:${input.code}:${String(input.context?.textbackNumberId || "global")}`).digest("hex");
}

async function sendAlert(input: IncidentInput, incidentId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.TEXTBACK_NOTIFICATION_EMAIL;
  const from = process.env.TEXTBACK_FROM_EMAIL;
  if (!apiKey || !to || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `operations-incident/${incidentId}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: "info@textback.se",
      subject: `[Textback ${input.severity === "critical" ? "KRITISKT" : "varning"}] ${input.code}`,
      text: `${input.summary}\n\nKälla: ${input.source}\nKod: ${input.code}\nIncident: ${incidentId}\nKontext: ${JSON.stringify(input.context || {}, null, 2)}`,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OPERATIONS_ALERT_${response.status}`);
  return true;
}

export async function recordOperationalIncident(input: IncidentInput) {
  try {
    const db = getSupabaseAdmin();
    const now = new Date().toISOString();
    const key = fingerprint(input);
    const { data: existing, error: lookupError } = await db.from("operational_incidents")
      .select("id,occurrence_count,alerted_at,resolved_at")
      .eq("fingerprint", key).maybeSingle();
    if (lookupError) throw lookupError;

    let incidentId: string;
    let shouldAlert = false;
    if (existing) {
      incidentId = existing.id;
      const reopened = Boolean(existing.resolved_at);
      const { error } = await db.from("operational_incidents").update({
        severity: input.severity,
        summary: input.summary.slice(0, 1000),
        context: input.context || {},
        occurrence_count: existing.occurrence_count + 1,
        last_seen_at: now,
        resolved_at: null,
        updated_at: now,
        ...(reopened ? { alerted_at: null } : {}),
      }).eq("id", incidentId);
      if (error) throw error;
      shouldAlert = input.severity === "critical" && (!existing.alerted_at || reopened);
    } else {
      const { data, error } = await db.from("operational_incidents").insert({
        source: input.source,
        severity: input.severity,
        code: input.code.slice(0, 200),
        summary: input.summary.slice(0, 1000),
        context: input.context || {},
        fingerprint: key,
      }).select("id").single();
      if (error || !data) throw error || new Error("INCIDENT_CREATE_FAILED");
      incidentId = data.id;
      shouldAlert = input.severity === "critical";
    }

    if (shouldAlert && await sendAlert(input, incidentId)) {
      await db.from("operational_incidents").update({ alerted_at: now, updated_at: now }).eq("id", incidentId);
    }
  } catch (error) {
    console.error("[operations] incident recording failed", { code: error instanceof Error ? error.message : "UNKNOWN" });
  }
}
