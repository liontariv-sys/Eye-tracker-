import { NextResponse } from "next/server";
import { accessCookieName, isOwner, loginWithApprovedEmail, normalizeEmail } from "@/lib/access-control";

const validEmail = (email: string) => Boolean(email && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("origin") && request.headers.get("origin") !== url.origin) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  const body = await request.json() as { email?: string };
  const email = normalizeEmail(body.email || "");
  if (!validEmail(email)) {
    return NextResponse.json({ error: "Digite um e-mail válido." }, { status: 400 });
  }
  if (isOwner(email)) {
    return NextResponse.json({ error: "Para proteger o painel, use ‘Entrar como administrador’." }, { status: 403 });
  }

  const result = await loginWithApprovedEmail(email);
  if (!result) {
    return NextResponse.json({ error: "Este e-mail ainda não foi autorizado. Solicite acesso abaixo." }, { status: 403 });
  }

  const response = NextResponse.json({ email: result.email, authorized: true });
  response.cookies.set(accessCookieName, result.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  return response;
}
