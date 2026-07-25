export function normalizePhoneNumber(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || /^(anonymous|private|restricted|unknown)$/i.test(raw)) return null;
  const compact = raw.replace(/[\s().-]/g, "");
  const swedish = compact.startsWith("00") ? `+${compact.slice(2)}` : compact.startsWith("0") ? `+46${compact.slice(1)}` : compact;
  if (!/^\+[1-9]\d{7,14}$/.test(swedish)) return null;
  return swedish;
}

export function samePhoneNumber(a: unknown, b: unknown): boolean {
  const left = normalizePhoneNumber(a);
  const right = normalizePhoneNumber(b);
  return Boolean(left && right && left === right);
}
