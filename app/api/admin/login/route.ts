import { NextResponse } from "next/server";
import { adminCookieName, adminSessionMaxAge, createAdminSession, validateAdminCredentials } from "@/lib/admin-auth";
import { normalizeEmail } from "@/lib/access-control";

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("origin") && request.headers.get("origin") !== url.origin) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }

  const body = await request.json() as { email?: string; password?: string };
  const valid = await validateAdminCredentials(normalizeEmail(body.email || ""), body.password || "");
  if (!valid) {
    return NextResponse.json({ error: "E-mail ou senha administrativa incorretos." }, { status: 401 });
  }

  try {
    const token = await createAdminSession();
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(adminCookieName, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: adminSessionMaxAge,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "A autenticação administrativa ainda não foi configurada no servidor." }, { status: 503 });
  }
}
