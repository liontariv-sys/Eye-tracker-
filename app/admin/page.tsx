import { redirect } from "next/navigation";
import AccessAdmin from "@/components/access-admin";
import { listAccessRequests } from "@/lib/access-control";
import { getAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await getAdminSession())) redirect("/admin/login");
  const requests = await listAccessRequests();
  return <AccessAdmin initialRequests={requests.map((item) => ({ ...item, requestedAt: item.requestedAt.toISOString(), decidedAt: item.decidedAt?.toISOString() ?? null }))} />;
}
