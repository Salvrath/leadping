import "server-only";
import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "./supabase";
import { finalizeReadySelfServiceNumber } from "./provisioning";

const COOKIE = "textback_customer_session";
const MAX_AGE = 60 * 60 * 12;

type Session = { userId: string; numberId: string; exp: number };

export function isCustomerAuthConfigured() {
  return Boolean(process.env.TEXTBACK_CUSTOMER_SESSION_SECRET && process.env.TEXTBACK_CUSTOMER_SESSION_SECRET.length >= 32);
}

function secret() {
  const value = process.env.TEXTBACK_CUSTOMER_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("CUSTOMER_AUTH_NOT_CONFIGURED");
  return value;
}

function encode(value: string) { return Buffer.from(value).toString("base64url"); }
function decode(value: string) { return Buffer.from(value, "base64url").toString(); }
function signature(payload: string) { return createHmac("sha256", secret()).update(payload).digest("base64url"); }

export function hashCustomerPassword(password: string) {
  if (password.length < 12 || password.length > 200) throw new Error("INVALID_CUSTOMER_PASSWORD");
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyCustomerPassword(password: string, stored: string) {
  const [algorithm, salt, expected] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const target = Buffer.from(expected, "hex");
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export function setCustomerSession(userId: string, numberId: string) {
  const session: Session = { userId, numberId, exp: Math.floor(Date.now() / 1000) + MAX_AGE };
  const payload = encode(JSON.stringify(session));
  cookies().set(COOKIE, `${payload}.${signature(payload)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export function clearCustomerSession() { cookies().set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 }); }

export function readCustomerSession(): Session | null {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw || !isCustomerAuthConfigured()) return null;
  const [payload, supplied] = raw.split(".");
  if (!payload || !supplied) return null;
  const expected = signature(payload);
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const value = JSON.parse(decode(payload)) as Session;
    return value.exp > Math.floor(Date.now() / 1000) && value.userId && value.numberId ? value : null;
  } catch { return null; }
}

export async function requireCustomer() {
  const session = readCustomerSession();
  if (!session) redirect("/portal/login");
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("customer_users")
    .select("id,email,textback_number_id,active,textback_numbers(id,business_name,provider_number,business_phone_numbers,sms_template,sms_sender,active)")
    .eq("id", session.userId).eq("textback_number_id", session.numberId).eq("active", true).maybeSingle();
  if (error || !data) redirect("/portal/login");

  const now = new Date().toISOString();
  await db.from("textback_numbers")
    .update({ portal_account_verified_at: now, updated_at: now })
    .eq("id", session.numberId)
    .is("portal_account_verified_at", null);
  await finalizeReadySelfServiceNumber(session.numberId);

  return data as any;
}
