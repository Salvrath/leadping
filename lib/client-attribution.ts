export const attributionKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "gbraid", "wbraid"] as const;
export type AttributionKey = typeof attributionKeys[number];
export type Attribution = Partial<Record<AttributionKey, string>> & { landing_path?: string; referrer?: string };

const storageKey = "textback_attribution";

function safeReferrer() {
  if (typeof document === "undefined" || !document.referrer) return "";
  try {
    const url = new URL(document.referrer);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return "";
  }
}

export function captureAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  let saved: Attribution = {};
  try { saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}") as Attribution; } catch {}
  const query = new URLSearchParams(window.location.search);
  const current: Attribution = { ...saved };
  for (const key of attributionKeys) {
    const value = query.get(key)?.trim();
    if (value && !current[key]) current[key] = value.slice(0, 200);
  }
  current.landing_path ||= window.location.pathname.slice(0, 500);
  current.referrer ||= safeReferrer();
  sessionStorage.setItem(storageKey, JSON.stringify(current));
  sessionStorage.setItem("textback_landing_path", current.landing_path);
  return current;
}

export function getAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  return captureAttribution();
}

export function attributionFormFields(attribution: Attribution) {
  const fields: Record<string, string> = {};
  for (const key of attributionKeys) {
    const value = attribution[key];
    if (value) fields[key.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase())] = value;
  }
  if (attribution.landing_path) fields.landingPath = attribution.landing_path;
  if (attribution.referrer) fields.referrer = attribution.referrer;
  return fields;
}