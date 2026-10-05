"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Clock3, Eye, KeyRound, LockKeyhole, Mail, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

type Props = { email?: string; status?: "none" | "pending" | "denied"; adminHref: string };

export default function AccessGate({ email = "", status = "none", adminHref }: Props) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [currentEmail, setCurrentEmail] = useState(email);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const enter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/access/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentEmail }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível entrar.");
      window.location.assign("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  };

  const requestAccess = async () => {
    if (!currentEmail) {
      setMessage("Digite seu e-mail antes de solicitar acesso.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/access/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentEmail }),
      });
      const data = await response.json() as { error?: string; email?: string; notified?: boolean };
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar a solicitação.");
      setCurrentEmail(data.email || currentEmail);
      setCurrentStatus("pending");
      setMessage(data.notified ? "Pedido enviado. Vinícius receberá um aviso por e-mail." : "Pedido registrado. Ele já aparece no painel de aprovação.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar a solicitação.");
    } finally {
      setLoading(false);
    }
  };

  const clearRequest = async () => {
    setLoading(true);
    await fetch("/api/access/clear", { method: "POST" });
    setCurrentStatus("none");
    setCurrentEmail("");
    setMessage("");
    setLoading(false);
  };

  const waiting = currentStatus === "pending";
  const denied = currentStatus === "denied";

  return <main className="access-page"><section className="access-card">
    <div className="access-brand"><span><Eye /></span><div><strong>LPNeC Oculab</strong><small>Laboratório de Percepção, Neurociências e Comportamento · UFPB</small></div></div>
    <div className={`access-icon ${currentStatus}`}>{waiting ? <Clock3 /> : denied ? <XCircle /> : <LockKeyhole />}</div>
    <h1>{waiting ? "Solicitação em análise" : denied ? "Acesso não autorizado" : "Acessar o Oculab"}</h1>
    <p>{waiting ? "Seu pedido foi registrado. Após a aprovação, atualize esta página para entrar." : denied ? "Este pedido não foi aprovado. Você pode corrigir o e-mail e solicitar uma nova análise." : "Se o seu e-mail já foi aprovado, entre diretamente. Caso contrário, solicite autorização."}</p>

    {waiting ? <>
      <div className="verified-email"><Mail /><div><small>E-mail informado</small><strong>{currentEmail}</strong></div></div>
      <button className="access-primary" type="button" onClick={() => window.location.reload()}><RefreshCw /> Verificar aprovação</button>
      <button className="access-link-button" type="button" onClick={clearRequest} disabled={loading}>Corrigir e-mail</button>
    </> : <form className="access-request-form" onSubmit={enter}>
      <label htmlFor="access-email">E-mail</label>
      <div className="access-email-field"><Mail /><input id="access-email" type="email" inputMode="email" autoComplete="email" value={currentEmail} onChange={(event) => setCurrentEmail(event.target.value)} placeholder="seuemail@exemplo.com" maxLength={254} required /></div>
      <button className="access-primary" type="submit" disabled={loading}><KeyRound /> {loading ? "Verificando…" : "Entrar com e-mail autorizado"}</button>
      <div className="access-divider"><span>Ainda não tem autorização?</span></div>
      <button className="access-request-button" type="button" onClick={requestAccess} disabled={loading}><Mail /> Solicitar acesso</button>
    </form>}

    {message && <p className="access-message" role="status">{message}</p>}
    <div className="admin-entry"><div><ShieldCheck /><span><strong>Área administrativa</strong><small>Acesso exclusivo do administrador.</small></span></div><a href={adminHref}>Entrar como administrador</a></div>
    <div className="access-privacy"><CheckCircle2 /><span>O acesso fica salvo neste navegador. Seus arquivos de eye tracking continuam sendo processados somente no seu dispositivo.</span></div>
  </section></main>;
}
