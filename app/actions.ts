"use server";
import { redirect } from "next/navigation";
import { leadSchema, type Lead } from "@/lib/lead-schema";
import { getLeadStorage } from "@/lib/lead-storage";
import { notifier, notifySafely } from "@/lib/server/notifications";
import { createPilotCheckout } from "@/lib/server/stripe";

export type FormState = { success: boolean; errors?: Record<string, string[]>; message?: string; id?: string; values?: Partial<Lead> };

export async function submitPilot(_: FormState, data: FormData): Promise<FormState> {
  const raw = Object.fromEntries(data);
  const candidate = { ...raw, privacy: raw.privacy === "on", authority: raw.authority === "on" };
  const parsed = leadSchema.safeParse(candidate);
  const safeValues = { company: String(raw.company || ""), orgNumber: String(raw.orgNumber || ""), contact: String(raw.contact || ""),
    email: String(raw.email || ""), phone: String(raw.phone || ""), workshopPhone: String(raw.workshopPhone || ""),
    telephony: String(raw.telephony || ""), message: String(raw.message || "") };
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors, values: safeValues };
  if (Date.now() - parsed.data.formStartedAt < 1500) return { success: false, message: "Formuläret skickades för snabbt. Vänta ett ögonblick och försök igen.", values: safeValues };
  try {
    const saved = await getLeadStorage().save(parsed.data);
    await notifySafely(() => notifier.application(parsed.data, saved.id), "application");
    return { success: true, id: saved.id };
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate")) return { success: false, message: "Ansökan har redan tagits emot." };
    console.error("[pilot] application failed", { code: error instanceof Error ? error.message : "UNKNOWN" });
    return { success: false, message: "Ansökan kunde inte sparas just nu. Försök igen eller kontakta oss.", values: safeValues };
  }
}

export async function startCheckout(data: FormData) {
  try {
    const url = await createPilotCheckout(String(data.get("leadId") || ""), getLeadStorage());
    redirect(url);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    redirect("/pilot/avbruten?reason=unavailable");
  }
}
