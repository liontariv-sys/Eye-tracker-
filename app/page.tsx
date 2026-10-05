import OculabWorkspace from "@/components/oculab-workspace";
import AccessGate from "@/components/access-gate";
import { cookies } from "next/headers";
import { accessCookieName, getDeviceAccessRequest } from "@/lib/access-control";
import { getAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (process.env.OCULAB_DEV_BYPASS === "true") {
    return <OculabWorkspace isAdmin={false} />;
  }

  const owner = Boolean(await getAdminSession());
  const cookieStore = await cookies();
  const request = owner ? null : await getDeviceAccessRequest(cookieStore.get(accessCookieName)?.value);
  if (!owner && request?.status !== "approved") {
    return <AccessGate email={request?.email} status={request?.status ?? "none"} adminHref="/admin" />;
  }

  return <OculabWorkspace isAdmin={owner} />;
}
