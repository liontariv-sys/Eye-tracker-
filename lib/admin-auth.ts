import "server-only";

import { cookies } from "next/headers";
import { isOwner, normalizeEmail, ownerEmail } from "@/lib/access-control";

export const adminCookieName = "oculab_admin";
export const adminSessionMaxAge = 60 * 60 * 12;

type AdminSession = {
  email: string;
  expiresAt: number;
};

const encoder = new TextEncoder();

export async function validateAdminCredentials(email: string, password: string) {
  const configuredPassword = process.env.OCULAB_ADMIN_PASSWORD || "";
  if (!configuredPassword || configuredPassword.length < 12) return false;
  if (!isOwner(email)) return false;

  const [received, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(password)),
    crypto.subtle.digest("SHA-256", encoder.encode(configuredPassword)),
  ]);

  return constantTimeEqual(new Uint8Array(received), new Uint8Array(expected));
}

export async function createAdminSession(): Promise<string> {
  const secret = sessionSecret();
  const session: AdminSession = {
    email: ownerEmail(),
    expiresAt: Date.now() + adminSessionMaxAge * 1000,
  };
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(session)));
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  return verifyAdminSession(cookieStore.get(adminCookieName)?.value);
}

export async function verifyAdminSession(token?: string | null): Promise<AdminSession | null> {
  if (!token) return null;
  const secret = process.env.OCULAB_SESSION_SECRET || "";
  if (secret.length < 32) return null;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expected = await sign(payload, secret);
  if (!constantTimeEqual(encoder.encode(signature), encoder.encode(expected))) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as Partial<AdminSession>;
    if (typeof parsed.email !== "string" || typeof parsed.expiresAt !== "number") return null;
    if (parsed.expiresAt <= Date.now() || !isOwner(parsed.email)) return null;
    return { email: normalizeEmail(parsed.email), expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function sessionSecret() {
  const secret = process.env.OCULAB_SESSION_SECRET || "";
  if (secret.length < 32) {
    throw new Error("OCULAB_SESSION_SECRET deve possuir pelo menos 32 caracteres.");
  }
  return secret;
}

async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function base64UrlEncode(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
