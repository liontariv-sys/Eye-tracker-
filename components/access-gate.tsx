"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, BarChart3, CheckCircle2, ChevronDown, Clock3, Cookie, Download, FileSpreadsheet, KeyRound, Laptop, LockKeyhole, Mail, RefreshCw, ShieldCheck, SlidersHorizontal, XCircle } from "lucide-react";
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
        <a href="#quem-somos">Quem somos</a>
        <a href="#privacidade">Privacidade</a>
      </nav>
      <a className="access-nav-cta" href="#acesso">Entrar <ArrowRight /></a>
    </header>

    <section className="access-hero">
      <div className="access-hero-copy">
        <span className="access-kicker">Tabulação de eye tracking</span>
        <h2>Do dado bruto a uma base que você <em>compreende.</em></h2>
        <p>O Oculab transforma arquivos de rastreamento ocular em planilhas claras, auditáveis e preparadas para as próximas etapas da pesquisa.</p>
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
    <div className="admin-entry"><ShieldCheck aria-hidden="true" /><a href={adminHref}>Administração</a></div>
      </section>
    </section>

    <section className="access-section access-about" id="sobre">
      <div className="access-about-heading">
        <span className="access-section-label">Sobre o projeto</span>
        <h2>Uma ferramenta construída a partir das rotinas reais de pesquisa.</h2>
      </div>
      <div className="access-about-copy">
        <p>O LPNeC Oculab nasceu no Laboratório de Percepção, Neurociências e Comportamento da UFPB para reduzir o trabalho manual envolvido na preparação de dados de eye tracking. Ele organiza em um mesmo percurso tarefas que costumavam exigir sucessivas planilhas, conferências e cálculos separados.</p>
        <p>O pesquisador continua no controle: relaciona as colunas do arquivo bruto, escolhe as variáveis de interesse e define a estrutura da saída. Assim, a ferramenta se adapta a estudos transversais ou longitudinais e a arquivos com nomes de campos diferentes, sem impor um único modelo de pesquisa.</p>
        <p>O objetivo não é substituir decisões metodológicas. É tornar a limpeza, a tabulação e a auditoria mais transparentes, rastreáveis e fáceis de revisar antes que os dados sigam para Excel, JASP ou SPSS.</p>
      </div>
    </section>

    <section className="access-section access-flow" id="como-funciona">
      <div className="access-process-copy">
        <span className="access-section-label">Como funciona</span>
        <h2>Você decide o caminho. O Oculab organiza a transformação.</h2>
        <p>O fluxo acompanha o raciocínio do pesquisador: primeiro entender o arquivo, depois definir o que analisar e, por fim, conferir o resultado.</p>
        <ul>
          <li><FileSpreadsheet /><span><strong>Importe</strong> um ou vários arquivos e identifique participantes, grupos e momentos.</span></li>
          <li><SlidersHorizontal /><span><strong>Relacione e configure</strong> as colunas, unidades e variáveis que realmente interessam.</span></li>
          <li><BarChart3 /><span><strong>Revise</strong> tabelas, sínteses, gráficos e a auditoria dos cálculos.</span></li>
          <li><Download /><span><strong>Exporte</strong> um Excel organizado para conferência ou análise estatística.</span></li>
        </ul>
      </div>
      <div className="access-process-visual" role="img" aria-label="Uma planilha bruta passa pelo Oculab e se transforma em tabelas, gráficos e um arquivo Excel organizado">
        <div className="process-sheet process-sheet-raw">
          <span>arquivo bruto</span>
          <i /><i /><i /><i /><i /><i /><i /><i /><i />
        </div>
        <div className="process-stream process-stream-in" aria-hidden="true"><i /><i /><i /></div>
        <div className="process-engine">
          <span className="process-orbit" />
          <div className="process-engine-core"><Image src="/brand/lpnec-logo-transparent.png" alt="LPNeC" width={88} height={52} unoptimized /><strong>Oculab</strong><small>mapear · calcular · auditar</small></div>
        </div>
        <div className="process-stream process-stream-out" aria-hidden="true"><i /><i /><i /></div>
        <div className="process-sheet process-sheet-ready">
          <span>base organizada</span>
          <div className="process-bars"><b /><b /><b /><b /></div>
          <div className="process-table-lines"><i /><i /><i /></div>
        </div>
      </div>
    </section>

    <section className="access-section access-team" id="quem-somos">
      <div className="access-team-heading">
        <span className="access-section-label">Quem somos</span>
        <h2>Pessoas, pesquisa e desenvolvimento no mesmo projeto.</h2>
        <p>O Oculab é desenvolvido no contexto do LPNeC, na UFPB. A equipe reúne experiência em pesquisa com comportamento visual e o compromisso de transformar uma rotina técnica em uma experiência mais clara para outros pesquisadores.</p>
      </div>
      <div className="access-team-grid">
        <article className="access-team-profile">
          <div className="access-team-photo access-team-photo-vinicius"><Image src="/team-vinicius.jpg" alt="Vinícius Freitas Barbosa da Silva" fill sizes="(max-width: 760px) 88vw, 31vw" unoptimized /></div>
          <div className="access-team-copy"><span>Concepção e desenvolvimento</span><h3>Vinícius Freitas Barbosa da Silva</h3><p>Graduando em Psicologia na UFPB e pesquisador do LPNeC. Concebe e desenvolve o Oculab, aproximando pesquisa em eye tracking, organização de dados e tecnologia aplicada à ciência.</p></div>
        </article>
        <article className="access-team-profile">
          <div className="access-team-photo access-team-photo-gessica"><Image src="/team-gessica.jpg?v=2" alt="Géssica Almeida de Freitas" fill sizes="(max-width: 760px) 88vw, 31vw" unoptimized /></div>
          <div className="access-team-copy"><span>Pesquisa e colaboração científica</span><h3>Géssica Almeida de Freitas</h3><p>Psicóloga, mestra em Neurociência Cognitiva e Comportamento e doutoranda em Psicologia Social pela UFPB. Integra o LPNeC e pesquisa neurociências, neuropsicologia, saúde mental, gênero e violência por parceiro íntimo.</p></div>
        </article>
        <article className="access-team-profile">
          <div className="access-team-photo access-team-photo-gabriella"><Image src="/team-gabriella.jpg?v=2" alt="Gabriella Medeiros Silva" fill sizes="(max-width: 760px) 88vw, 31vw" unoptimized /></div>
          <div className="access-team-copy"><span>Pesquisa e colaboração científica</span><h3>Gabriella Medeiros Silva</h3><p>Psicóloga, doutora em Psicologia Social pela UFPB, especialista em Neurociência do Desenvolvimento Humano e integrante do LPNeC. Pesquisa funções perceptuais e cognitivas com medidas psicofísicas, psicofisiológicas e eletrofisiológicas.</p></div>
        </article>
      </div>
    </section>

    <section className="access-privacy-section" id="privacidade">
      <div className="access-privacy-intro">
        <span className="access-section-label">Privacidade e ética</span>
        <h2>O dado bruto é processado no seu navegador, do início ao fim.</h2>
        <p>O Oculab separa os dados de pesquisa das informações usadas para controlar o acesso. Entenda, de forma direta, o que acontece em cada momento.</p>
      </div>
      <div className="access-privacy-path">
        <article><span><FileSpreadsheet /></span><div><strong>Ao selecionar os arquivos</strong><p>O navegador lê as planilhas no próprio dispositivo. Os arquivos brutos não são enviados nem armazenados no servidor do Oculab.</p></div></article>
        <article><span><Laptop /></span><div><strong>Durante a tabulação</strong><p>Limpeza, cálculos, prévias e gráficos acontecem na memória da sessão. Fechar ou atualizar a página elimina o lote carregado e exige uma nova importação.</p></div></article>
        <article><span><Download /></span><div><strong>Na exportação</strong><p>O arquivo Excel é gerado para download no dispositivo. A guarda, o compartilhamento e o descarte desse arquivo permanecem sob responsabilidade da equipe de pesquisa.</p></div></article>
      </div>
      <div className="access-privacy-details">
        <article><Cookie /><div><h3>O que fica salvo para o acesso</h3><p>O e-mail informado, o estado da autorização e um identificador técnico de sessão são mantidos para reconhecer usuários aprovados. Um cookie essencial e protegido lembra o acesso neste navegador; ele não contém as planilhas nem os dados dos participantes.</p></div></article>
        <article><ShieldCheck /><div><h3>Compromisso ético</h3><p>O Oculab foi projetado para apoiar práticas alinhadas aos princípios de finalidade, necessidade, segurança e prevenção da LGPD e às exigências de privacidade e confidencialidade das Resoluções CNS nº 466/2012 e nº 510/2016.</p><p>Isso não substitui a aprovação do estudo pelo sistema CEP/Conep nem as responsabilidades do pesquisador. Sempre que possível, use códigos no lugar de nomes e importe apenas as colunas necessárias.</p><div className="access-norm-links"><a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" target="_blank" rel="noreferrer">LGPD — Lei nº 13.709/2018</a><a href="https://www.gov.br/conselho-nacional-de-saude/pt-br/acesso-a-informacao/atos-normativos/resolucoes/2012/resolucao-no-466.pdf" target="_blank" rel="noreferrer">Resolução CNS nº 466/2012</a><a href="https://www.gov.br/conselho-nacional-de-saude/pt-br/acesso-a-informacao/camaras-tecnicas-e-comissoes/conep/instancia-de-ciencias-humanas-e-sociais/legislacao/resolucao-no-510-de-07-de-abril-de-2016" target="_blank" rel="noreferrer">Resolução CNS nº 510/2016</a></div></div></article>
      </div>
      <a className="access-privacy-cta" href="#acesso">Acessar o Oculab <ArrowRight /></a>
    </section>

    <footer className="access-footer"><strong>LPNeC Oculab</strong><span>Tabulação de dados de eye tracking para pesquisa científica</span></footer>
  </main>;
}
