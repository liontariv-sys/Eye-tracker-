import { NextResponse } from "next/server";
import { accessCookieName } from "@/lib/access-control";

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("origin") && request.headers.get("origin") !== url.origin) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  }
  const response = NextResponse.json({ cleared: true });
  response.cookies.set(accessCookieName, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
