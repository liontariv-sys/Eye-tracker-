import "server-only";

export async function notifyAccessRequest(requester: { email: string; displayName: string }, adminUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const notificationEmail = process.env.OCULAB_NOTIFICATION_EMAIL;
  if (!apiKey || !notificationEmail) return { sent: false, reason: "not_configured" as const };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.ACCESS_EMAIL_FROM || "LPNeC Oculab <onboarding@resend.dev>",
      to: [notificationEmail],
      subject: "Nova solicitação de acesso ao LPNeC Oculab",
      html: `<p><strong>${escapeHtml(requester.displayName)}</strong> solicitou acesso ao LPNeC Oculab.</p><p>E-mail informado: ${escapeHtml(requester.email)}</p><p><a href="${escapeHtml(adminUrl)}">Abrir painel para aprovar ou negar</a></p>`,
    }),
  });

  if (!response.ok) return { sent: false, reason: "provider_error" as const };
  return { sent: true as const };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
