"use server";
import { redirect } from "next/navigation";
import { leadSchema, type Lead } from "@/lib/lead-schema";
import { getLeadStorage } from "@/lib/lead-storage";
import { notifier, notifySafely } from "@/lib/server/notifications";
import { createPilotCheckout } from "@/lib/server/stripe";
import { hasAvailableProviderNumber } from "@/lib/server/provisioning";
import { applicationErrorMessage } from "@/lib/application-errors";

export type FormState = { success: boolean; errors?: Record<string, string[]>; message?: string; id?: string; checkoutUrl?: string; values?: Partial<Lead> };

export async function submitPilot(_: FormState, data: FormData): Promise<FormState> {
  const raw = Object.fromEntries(data);
  const candidate = { ...raw, privacy: raw.privacy === "on", authority: raw.authority === "on" };
  const parsed = leadSchema.safeParse(candidate);
  const safeValues = {
    company: String(raw.company || ""), contact: String(raw.contact || ""), email: String(raw.email || ""),
    phone: String(raw.phone || ""), businessPhone: String(raw.businessPhone || ""), phoneNumbers: Number(raw.phoneNumbers || 1),
    telephony: String(raw.telephony || ""), industry: String(raw.industry || ""), missedCalls: Number(raw.missedCalls || 0), message: String(raw.message || ""),
  };
  if (!parsed.success) return { success: false, errors: parsed.error.flatten().fieldErrors, values: safeValues };
  if (parsed.data.phoneNumbers !== 1) return { success: false, errors: { phoneNumbers: ["Självbetjäningen stöder ett telefonnummer per abonnemang. Kontakta info@textback.se för flera nummer."] }, values: safeValues };
  if (Date.now() - parsed.data.formStartedAt < 1500) return { success: false, message: "Formuläret skickades för snabbt. Vänta ett ögonblick och försök igen.", values: safeValues };

  try {
    const storage = getLeadStorage();
    const saved = await storage.save(parsed.data);
    await storage.update(saved.id, { provisioning_status: "awaiting_payment", updated_at: new Date().toISOString() });

    if (!await hasAvailableProviderNumber()) {
      await storage.update(saved.id, { provisioning_status: "awaiting_number", provisioning_error: "NO_AVAILABLE_PROVIDER_NUMBER" });
      await notifySafely(() => notifier.capacity({ email: parsed.data.email, company: parsed.data.company, leadId: saved.id }), "capacity");
      return { success: false, id: saved.id, message: "Textback är tillfälligt fullbokat. Ingen betalning har genomförts. Vi öppnar beställningen igen när ett nytt nummer är tillgängligt.", values: safeValues };
    }

    const checkoutUrl = await createPilotCheckout(saved.id, storage);
    return { success: true, id: saved.id, checkoutUrl };
  } catch (error) {
    console.error("[textback] self-service checkout failed", { code: error instanceof Error ? error.message : "UNKNOWN" });
    return { success: false, message: applicationErrorMessage(error), values: safeValues };
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
