"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Clock3, Eye, KeyRound, LockKeyhole, Mail, RefreshCw, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import Image from "next/image";

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

  return <main className="access-page">
    <div className="access-orb access-orb-one" aria-hidden="true" />
    <div className="access-orb access-orb-two" aria-hidden="true" />
    <section className="access-shell">
      <aside className="access-hero">
        <div className="access-hero-brand"><Image src="/brand/lpnec-logo-transparent.png" alt="LPNeC" width={132} height={82} priority /><span>Oculab</span></div>
        <div className="access-hero-copy">
          <span className="access-kicker"><Sparkles /> Tecnologia para pesquisa</span>
          <h2>Dados oculares com <em>clareza e precisão.</em></h2>
          <p>Da planilha bruta à base pronta para análise, com um fluxo simples para pesquisadores do LPNeC.</p>
        </div>
        <div className="access-hero-highlights">
          <div><span><Eye /></span><p><strong>Fluxo intuitivo</strong><small>Importe, configure e revise.</small></p></div>
          <div><span><ShieldCheck /></span><p><strong>Acesso controlado</strong><small>Somente pessoas autorizadas.</small></p></div>
        </div>
      </aside>
      <section className="access-card">
        <div className="access-card-head">
          <div className={`access-icon ${currentStatus}`}>{waiting ? <Clock3 /> : denied ? <XCircle /> : <LockKeyhole />}</div>
          <span className="access-card-kicker">Bem-vindo ao LPNeC Oculab</span>
          <h1>{waiting ? "Solicitação em análise" : denied ? "Acesso não autorizado" : "Acesse sua área"}</h1>
          <p>{waiting ? "Seu pedido foi registrado. Após a aprovação, atualize esta página para entrar." : denied ? "Este pedido não foi aprovado. Você pode corrigir o e-mail e solicitar uma nova análise." : "Use um e-mail já autorizado ou solicite acesso ao administrador."}</p>
        </div>

    {waiting ? <>
      <div className="verified-email"><Mail /><div><small>E-mail informado</small><strong>{currentEmail}</strong></div></div>
      <button className="access-primary" type="button" onClick={() => window.location.reload()}><RefreshCw /> Verificar aprovação</button>
      <button className="access-link-button" type="button" onClick={clearRequest} disabled={loading}>Corrigir e-mail</button>
    </> : <form className="access-request-form" onSubmit={enter}>
      <label htmlFor="access-email">Seu e-mail</label>
      <div className="access-email-field"><Mail /><input id="access-email" type="email" inputMode="email" autoComplete="email" value={currentEmail} onChange={(event) => setCurrentEmail(event.target.value)} placeholder="nome@exemplo.com" maxLength={254} required /></div>
      <button className="access-primary" type="submit" disabled={loading}><KeyRound /> {loading ? "Verificando…" : "Entrar com e-mail autorizado"}</button>
      <div className="access-divider"><span>Primeiro acesso?</span></div>
      <button className="access-request-button" type="button" onClick={requestAccess} disabled={loading}><Mail /> Solicitar autorização</button>
    </form>}

    {message && <p className="access-message" role="status">{message}</p>}
    <div className="admin-entry"><div><ShieldCheck /><span><strong>Área administrativa</strong><small>Acesso exclusivo do administrador.</small></span></div><a href={adminHref}>Entrar como administrador</a></div>
        <div className="access-privacy"><CheckCircle2 /><span>Seu acesso fica salvo neste navegador. Os arquivos são processados no próprio dispositivo.</span></div>
      </section>
    </section>
  </main>;
}
