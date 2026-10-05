import { NextResponse } from "next/server";
import { adminCookieName } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("origin") && request.headers.get("origin") !== url.origin) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(adminCookieName, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
