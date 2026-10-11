"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, BarChart3, CheckCircle2, ChevronDown, Clock3, Eye, FileSpreadsheet, KeyRound, Layers3, LockKeyhole, Mail, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
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

  return <main className="access-page" id="inicio">
    <header className="access-nav">
      <a className="access-nav-brand" href="#inicio" aria-label="LPNeC Oculab — início">
        <Image src="/brand/lpnec-logo-transparent.png" alt="LPNeC" width={118} height={70} priority unoptimized />
        <span>Oculab</span>
      </a>
      <nav aria-label="Navegação da página inicial">
        <a href="#sobre">Sobre</a>
        <a href="#como-funciona">Como funciona</a>
        <a href="#privacidade">Privacidade</a>
      </nav>
      <a className="access-nav-cta" href="#acesso">Entrar <ArrowRight /></a>
    </header>

    <section className="access-hero">
      <div className="access-hero-copy">
        <span className="access-kicker">LPNeC · UFPB</span>
        <h2>Dados oculares prontos para <em>análise.</em></h2>
        <p>Importe arquivos de eye tracking, escolha as variáveis e gere planilhas organizadas para conferência, SPSS e JASP.</p>
        <div className="access-hero-actions">
          <a className="access-hero-primary" href="#acesso">Acessar o Oculab <ArrowRight /></a>
          <a className="access-hero-secondary" href="#como-funciona">Conhecer o fluxo <ChevronDown /></a>
        </div>
        <p className="access-hero-trust"><CheckCircle2 /> Processamento local no navegador</p>
      </div>

      <section className="access-card" id="acesso">
        <div className="access-card-head">
          <div className={`access-icon ${currentStatus}`}>{waiting ? <Clock3 /> : denied ? <XCircle /> : <LockKeyhole />}</div>
          <span className="access-card-kicker">Área de acesso</span>
          <h1>{waiting ? "Solicitação em análise" : denied ? "Acesso não autorizado" : "Entre no Oculab"}</h1>
          <p>{waiting ? "Seu pedido foi registrado. Após a aprovação, verifique novamente para entrar." : denied ? "Este e-mail não foi aprovado. Confira o endereço ou envie uma nova solicitação." : "Informe seu e-mail. Se ele já estiver autorizado, o acesso será imediato."}</p>
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
      </section>
    </section>

    <section className="access-section access-about" id="sobre">
      <div className="access-section-heading">
        <span>Sobre o projeto</span>
        <h2>Menos etapas manuais. Mais consistência na tabulação.</h2>
        <p>O LPNeC Oculab foi desenvolvido para apoiar a organização de dados oculomotores em diferentes desenhos de pesquisa.</p>
      </div>
      <div className="access-feature-grid">
        <article><span><FileSpreadsheet /></span><h3>Arquivos flexíveis</h3><p>Reconheça e relacione colunas de diferentes formatos de planilha.</p></article>
        <article><span><Layers3 /></span><h3>Fluxo orientado</h3><p>Importe, mapeie, configure e revise em etapas claramente separadas.</p></article>
        <article><span><BarChart3 /></span><h3>Saída organizada</h3><p>Exporte rastreio, resumos e bases preparadas para análise estatística.</p></article>
      </div>
    </section>

    <section className="access-section access-flow" id="como-funciona">
      <div className="access-section-heading">
        <span>Como funciona</span>
        <h2>Da planilha bruta ao Excel final.</h2>
      </div>
      <ol className="access-flow-list">
        <li><b>01</b><div><strong>Importe</strong><p>Adicione um ou vários arquivos e identifique participantes e grupos.</p></div></li>
        <li><b>02</b><div><strong>Mapeie</strong><p>Indique qual coluna do arquivo corresponde a cada informação necessária.</p></div></li>
        <li><b>03</b><div><strong>Configure</strong><p>Escolha variáveis, unidades, desenho do estudo e formato de saída.</p></div></li>
        <li><b>04</b><div><strong>Revise</strong><p>Confira tabelas, gráficos e auditoria antes de baixar o Excel.</p></div></li>
      </ol>
    </section>

    <section className="access-section access-privacy-section" id="privacidade">
      <div className="access-privacy-mark"><Eye /></div>
      <div><span>Privacidade dos dados</span><h2>Seus arquivos permanecem no dispositivo.</h2><p>As planilhas são processadas no navegador e não são armazenadas pelo Oculab. Ao atualizar ou fechar a página, será necessário importá-las novamente.</p></div>
      <a href="#acesso">Entrar no Oculab <ArrowRight /></a>
    </section>

    <footer className="access-footer"><strong>LPNeC Oculab</strong><span>Laboratório de Percepção, Neurociências e Comportamento · UFPB</span></footer>
  </main>;
}
