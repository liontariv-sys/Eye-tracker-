"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Eye, KeyRound, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível entrar.");
      window.location.assign("/admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="access-page">
    <div className="access-orb access-orb-one" aria-hidden="true" /><div className="access-orb access-orb-two" aria-hidden="true" />
    <section className="access-shell">
      <aside className="access-hero">
        <div className="access-hero-brand"><Image src="/brand/lpnec-logo-transparent.png" alt="LPNeC" width={132} height={82} priority unoptimized /><span>Oculab</span></div>
        <div className="access-hero-copy"><span className="access-kicker"><Sparkles /> Gestão segura</span><h2>Controle de acesso com <em>simplicidade.</em></h2><p>Aprove solicitações e mantenha o ambiente do laboratório organizado em um só lugar.</p></div>
        <div className="access-hero-highlights"><div><span><Eye /></span><p><strong>Visão centralizada</strong><small>Pedidos e acessos reunidos.</small></p></div><div><span><ShieldCheck /></span><p><strong>Ambiente protegido</strong><small>Entrada exclusiva do administrador.</small></p></div></div>
      </aside>
      <section className="access-card">
        <div className="access-card-head"><div className="access-icon"><ShieldCheck /></div><span className="access-card-kicker">Acesso restrito</span><h1>Área administrativa</h1><p>Entre com suas credenciais para gerenciar as autorizações do Oculab.</p></div>
    <form className="access-request-form" onSubmit={submit}>
      <label htmlFor="admin-email">E-mail do administrador</label>
      <div className="access-email-field"><Mail /><input id="admin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@exemplo.com" required /></div>
      <label htmlFor="admin-password">Senha</label>
      <div className="access-email-field"><LockKeyhole /><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" required /></div>
      <button className="access-primary" type="submit" disabled={loading}><KeyRound /> {loading ? "Verificando…" : "Entrar como administrador"}</button>
    </form>
    {message && <p className="access-message" role="alert">{message}</p>}
        <div className="admin-entry admin-entry-back"><CheckCircle2 /><Link href="/">Voltar à entrada do Oculab</Link></div>
      </section>
    </section>
  </main>;
}
