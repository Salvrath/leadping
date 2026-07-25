import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "textback_admin";
const SESSION_SECONDS = 60 * 60 * 12;

function secret() {
  const value = process.env.TEXTBACK_ADMIN_SECRET;
  if (!value || value.length < 32) throw new Error("ADMIN_AUTH_NOT_CONFIGURED");
  return value;
}

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function verifyAdminPassword(password: string) {
  const expected = process.env.TEXTBACK_ADMIN_PASSWORD;
  return Boolean(expected && expected.length >= 12 && equal(password, expected));
}

export function createAdminSession() {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = String(expires);
  cookies().set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export function clearAdminSession() {
  cookies().set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
}

export function isAdminAuthenticated() {
  try {
    const token = cookies().get(COOKIE_NAME)?.value;
    if (!token) return false;
    const [payload, signature] = token.split(".");
    if (!payload || !signature || !equal(sign(payload), signature)) return false;
    const expires = Number(payload);
    return Number.isFinite(expires) && expires > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function requireAdmin() {
  if (!isAdminAuthenticated()) redirect("/admin/login");
}
