"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Clock3, LogOut, Mail, ShieldCheck, X } from "lucide-react";

type RequestItem = { id: string; email: string; displayName: string; status: "pending" | "approved" | "denied"; requestedAt: string; decidedAt: string | null; decidedBy: string | null };

export default function AccessAdmin({ initialRequests }: { initialRequests: RequestItem[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [working, setWorking] = useState("");
  const decide = async (id: string, status: "approved" | "denied") => {
    setWorking(id);
    const response = await fetch("/api/access/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (response.ok) {
      const selected = requests.find((item) => item.id === id);
      setRequests((current) => current.map((item) => item.email === selected?.email ? { ...item, status, decidedAt: new Date().toISOString() } : item));
    }
    setWorking("");
  };
  const signOut = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.assign("/");
  };
  return <main className="admin-page"><section className="admin-shell">
    <header className="admin-header"><div><div className="admin-brand"><Image src="/brand/lpnec-logo-transparent.png" alt="LPNeC" width={72} height={45} /><Link href="/"><ArrowLeft /> Voltar ao Oculab</Link></div><h1>Solicitações de acesso</h1><p>Aprove ou negue os pedidos feitos pelo formulário de entrada.</p></div><div className="admin-header-actions"><span><ShieldCheck /> {requests.filter((item) => item.status === "approved").length} autorizados</span><button type="button" onClick={signOut}><LogOut /> Sair</button></div></header>
    <div className="admin-list">
      {!requests.length && <div className="admin-empty"><Mail /><strong>Nenhuma solicitação recebida</strong><span>Os novos pedidos aparecerão aqui.</span></div>}
      {requests.map((item) => <article className="admin-request" key={item.id}>
        <div className={`request-status ${item.status}`}>{item.status === "pending" ? <Clock3 /> : item.status === "approved" ? <Check /> : <X />}</div>
        <div className="request-person"><strong>{item.displayName}</strong><span>{item.email}</span><small>Solicitado em {new Date(item.requestedAt).toLocaleString("pt-BR")}</small></div>
        <div className="request-label">{item.status === "pending" ? "Pendente" : item.status === "approved" ? "Autorizado" : "Negado"}</div>
        <div className="request-actions"><button className="approve" disabled={working === item.id || item.status === "approved"} onClick={() => decide(item.id, "approved")}><Check /> Aprovar</button><button className="deny" disabled={working === item.id || item.status === "denied"} onClick={() => decide(item.id, "denied")}><X /> Negar</button></div>
      </article>)}
    </div>
  </section></main>;
}
