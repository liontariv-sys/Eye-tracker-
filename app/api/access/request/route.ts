import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { accessCookieName, normalizeEmail, requestAccess } from "@/lib/access-control";
import { notifyAccessRequest } from "@/lib/access-email";

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("origin") && request.headers.get("origin") !== url.origin) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const body = await request.json() as { email?: string };
  const email = normalizeEmail(body.email || "");
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Digite um e-mail válido." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const result = await requestAccess(email, cookieStore.get(accessCookieName)?.value);
  const notification = await notifyAccessRequest({ email, displayName: email }, `${url.origin}/admin`);
  const response = NextResponse.json({ status: result.record?.status ?? "pending", email, notified: notification.sent });
  if (result.token) response.cookies.set(accessCookieName, result.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180 });
  return response;
}
