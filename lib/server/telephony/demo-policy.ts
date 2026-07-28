import "server-only";

export const DEMO_SMS_MESSAGE = "Hej! Du har testat Textback. Fånga missade samtal automatiskt och få fler kundärenden. Skaffa Textback: https://textback.se";

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? Math.floor(parsed) : fallback;
}

export function demoCooldownMinutes(env: NodeJS.ProcessEnv = process.env) {
  return boundedInteger(env.TEXTBACK_DEMO_COOLDOWN_MINUTES, 360, 15, 1440);
}

export function demoDailyLimit(env: NodeJS.ProcessEnv = process.env) {
  return boundedInteger(env.TEXTBACK_DEMO_DAILY_LIMIT, 100, 1, 5000);
}
