import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { deviceAccessRequests } from "@/db/schema";

export type AccessStatus = "pending" | "approved" | "denied";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const ownerEmail = () => normalizeEmail(process.env.OCULAB_OWNER_EMAIL || "");
export const isOwner = (email: string) => Boolean(ownerEmail()) && normalizeEmail(email) === ownerEmail();
export const accessCookieName = "oculab_access";

export async function hashAccessToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createAccessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getDeviceAccessRequest(token?: string | null) {
  if (!token) return null;
  const db = await getDb();
  const tokenHash = await hashAccessToken(token);
  const rows = await db.select().from(deviceAccessRequests).where(eq(deviceAccessRequests.tokenHash, tokenHash)).limit(1);
  return rows[0] ?? null;
}

export async function listAccessRequests() {
  const db = await getDb();
  const rows = await db.select().from(deviceAccessRequests).orderBy(desc(deviceAccessRequests.requestedAt));
  const seen = new Set<string>();
  return rows.filter((row) => {
    const email = normalizeEmail(row.email);
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

async function latestEmailDecision(email: string) {
  const db = await getDb();
  const rows = await db.select().from(deviceAccessRequests).where(and(
    eq(deviceAccessRequests.email, normalizeEmail(email)),
    ne(deviceAccessRequests.status, "pending"),
  )).orderBy(desc(deviceAccessRequests.decidedAt)).limit(1);
  return rows[0] ?? null;
}

export async function loginWithApprovedEmail(email: string) {
  const normalized = normalizeEmail(email);
  const decision = await latestEmailDecision(normalized);
  if (!decision || decision.status !== "approved") return null;

  const token = createAccessToken();
  const tokenHash = await hashAccessToken(token);
  const now = new Date();
  const id = crypto.randomUUID();
  const db = await getDb();
  await db.insert(deviceAccessRequests).values({
    id,
    tokenHash,
    email: normalized,
    displayName: decision.displayName || normalized,
    status: "approved",
    requestedAt: now,
    decidedAt: now,
    decidedBy: decision.decidedBy,
  });
  return { token, email: normalized };
}

export async function requestAccess(email: string, currentToken?: string | null) {
  const normalized = normalizeEmail(email);
  const existing = await getDeviceAccessRequest(currentToken);
  if (existing?.status === "approved") return { record: existing, token: null };
  const now = new Date();
  const db = await getDb();
  if (existing) {
    await db.update(deviceAccessRequests).set({
      email: normalized,
      displayName: normalized,
      status: "pending",
      requestedAt: now,
      decidedAt: null,
      decidedBy: null,
    }).where(eq(deviceAccessRequests.id, existing.id));
    return { record: await getDeviceAccessRequest(currentToken), token: null };
  }

  const token = createAccessToken();
  const tokenHash = await hashAccessToken(token);
  const id = crypto.randomUUID();
  await db.insert(deviceAccessRequests).values({
    id,
    tokenHash,
    email: normalized,
    displayName: normalized,
    status: "pending",
    requestedAt: now,
    decidedAt: null,
    decidedBy: null,
  });
  const rows = await db.select().from(deviceAccessRequests).where(eq(deviceAccessRequests.id, id)).limit(1);
  return { record: rows[0] ?? null, token };
}

export async function decideAccess(id: string, status: Extract<AccessStatus, "approved" | "denied">, decidedBy: string) {
  const db = await getDb();
  const targetRows = await db.select().from(deviceAccessRequests).where(eq(deviceAccessRequests.id, id)).limit(1);
  const target = targetRows[0];
  if (!target) return null;
  await db.update(deviceAccessRequests).set({ status, decidedAt: new Date(), decidedBy: normalizeEmail(decidedBy) }).where(eq(deviceAccessRequests.email, normalizeEmail(target.email)));
  const rows = await db.select().from(deviceAccessRequests).where(eq(deviceAccessRequests.id, id)).limit(1);
  return rows[0] ?? null;
}
