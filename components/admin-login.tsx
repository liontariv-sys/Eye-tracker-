"use client";

import { FormEvent, useState } from "react";
import { Eye, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";

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

  return <main className="access-page"><section className="access-card">
    <div className="access-brand"><span><Eye /></span><div><strong>LPNeC Oculab</strong><small>Laboratório de Percepção, Neurociências e Comportamento · UFPB</small></div></div>
    <div className="access-icon"><ShieldCheck /></div>
    <h1>Área administrativa</h1>
    <p>Entre com o e-mail do administrador e a senha configurada com segurança no Cloudflare.</p>
    <form className="access-request-form" onSubmit={submit}>
      <label htmlFor="admin-email">E-mail do administrador</label>
      <div className="access-email-field"><Mail /><input id="admin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seuemail@exemplo.com" required /></div>
      <label htmlFor="admin-password">Senha administrativa</label>
      <div className="access-email-field"><LockKeyhole /><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha administrativa" required /></div>
      <button className="access-primary" type="submit" disabled={loading}><KeyRound /> {loading ? "Verificando…" : "Entrar como administrador"}</button>
    </form>
    {message && <p className="access-message" role="alert">{message}</p>}
    <div className="admin-entry"><Link href="/">Voltar à entrada do Oculab</Link></div>
  </section></main>;
}
