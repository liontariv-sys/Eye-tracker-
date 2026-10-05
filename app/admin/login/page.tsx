import { redirect } from "next/navigation";
import AdminLogin from "@/components/admin-login";
import { getAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");
  return <AdminLogin />;
}
