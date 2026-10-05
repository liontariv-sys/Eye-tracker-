import { NextResponse } from "next/server";
import { decideAccess } from "@/lib/access-control";
import { getAdminSession } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Apenas o administrador pode alterar acessos." }, { status: 403 });
  const url = new URL(request.url);
  if (request.headers.get("origin") && request.headers.get("origin") !== url.origin) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const body = await request.json() as { id?: string; status?: string };
  if (!body.id || (body.status !== "approved" && body.status !== "denied")) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
  const record = await decideAccess(body.id, body.status, session.email);
  return NextResponse.json({ record });
}
