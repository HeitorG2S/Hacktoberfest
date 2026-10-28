import { useEffect, useState } from "react";
import { useFinancialState } from "./store";
import { currentMonth, formatMoney, monthSummary, totalRequested } from "./engine";
import { Painel } from "./ui/painel/Painel";
import { Objetivos } from "./ui/objetivos/Objetivos";
import { Importacao } from "./ui/importacao/Importacao";
import { Simulador } from "./ui/simulador/Simulador";
import { Comparador } from "./ui/comparador/Comparador";
import { Lancamentos } from "./ui/lancamentos/Lancamentos";
import { Investimentos } from "./ui/investimentos/Investimentos";

// Layout inspirado no painel "Clareza" (painel-financeiro-interface.zip): barra lateral, centro com as
// seções e o chat (Simulador) fixo à direita; no tablet o chat vira gaveta e no celular há barra inferior.
const TABS = [
  { id: "painel", label: "Visão geral", icon: "◫", title: "Mais clareza para", em: "suas escolhas.", sub: "Entenda o que entra, o que sai e para onde seu dinheiro está indo.", C: Painel },
  { id: "lancamentos", label: "Lançamentos", icon: "☷", title: "Registre o", em: "dia a dia.", sub: "Gastos e receitas extras do mês; o disponível se ajusta sozinho.", C: Lancamentos },
  { id: "comparador", label: "Laboratório", icon: "⚖", title: "Compare antes de", em: "decidir.", sub: "Plano do Gemma, plano do algoritmo e plano conservador, todos verificados pelo mesmo motor.", C: Comparador },
  { id: "investimentos", label: "Investimentos", icon: "▥", title: "Entenda antes de", em: "investir.", sub: "Cotações da Brapi e projeções calculadas pelo motor. Informativo, não é recomendação.", C: Investimentos },
  { id: "objetivos", label: "Metas financeiras", icon: "◎", title: "Metas com", em: "prioridade.", sub: "Valor desejado, prazo e prioridade de cada objetivo.", C: Objetivos },
  { id: "importacao", label: "Importar planilha", icon: "↑", title: "Traga seus", em: "lançamentos.", sub: "O arquivo é lido só no navegador; mostramos o que entrou, o que saiu e por quê.", C: Importacao },
] as const;
type TabId = (typeof TABS)[number]["id"] | "simulador";

function todayLabel(d = new Date()): string {
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
}

// Modelo de planilha (CSV do formato simfin-import/v1) com linhas de exemplo fictícias.
function downloadTemplate() {
  const csv = "date;description;amount;type;categorySlug;recurring\n2026-10-05;Salário;2500,00;CREDIT;salario;true\n2026-10-06;Aluguel;800,00;DEBIT;moradia;true\n2026-10-08;Mercado da semana;180,50;DEBIT;mercado;false\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-lancamentos.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [state, setState, reset] = useFinancialState();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("painel");
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    // As telas pedem troca de aba com window.dispatchEvent(new CustomEvent("simfin:tab", { detail: "<id>" })).
    const onTab = (e: Event) => {
      const id = (e as CustomEvent<TabId>).detail;
      if (id === "simulador") setChatOpen(true);
      else if (TABS.some((t) => t.id === id)) {
        setTab(id);
        setChatOpen(false);
      }
    };
    const onAsk = () => setChatOpen(true);
    window.addEventListener("simfin:tab", onTab);
    window.addEventListener("simfin:ask", onAsk);
    return () => {
      window.removeEventListener("simfin:tab", onTab);
      window.removeEventListener("simfin:ask", onAsk);
    };
  }, []);

  const current = TABS.find((t) => t.id === tab)!;
  const Current = current.C;
  const month = currentMonth();
  const summary = monthSummary(state, month);
  const avail = summary.effectiveAvailable;
  const requested = totalRequested(state.goals);
  const empty = state.budget.income === 0 && state.entries.length === 0;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><img src="/favicon.svg" alt="" /></span>
          <b>clareza<span>.</span></b>
        </div>
        <p className="side-label">SEU ESPAÇO</p>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "nav active" : "nav"} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              <i>{t.icon}</i>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="local-note">
            <span>✓</span>
            <div>
              <b>Seus dados ficam aqui</b>
              <small>Salvos neste navegador</small>
            </div>
          </div>
          <button className="demo-link" onClick={() => { if (window.confirm("Apagar todos os dados deste navegador?")) reset(); }}>↺ &nbsp; Limpar dados</button>
          <div className="profile">
            <span className="avatar">C</span>
            <div>
              <b>Meu espaço</b>
              <small>{empty ? "Comece pelo orçamento" : `${state.entries.length} lançamento(s) salvos`}</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="center">
        <header className="topbar">
          <div>
            <span className="green-dot" /> <span className="crumb-root">Seu espaço financeiro</span> <span className="slash">/</span> <b>{current.label}</b>
          </div>
          <div className="top-actions">
            <span className="privacy"><i /> Dados locais</span>
            <button className="mobile-chat" onClick={() => setChatOpen(true)} aria-label="Abrir conversa">✳</button>
            <span className="avatar light">C</span>
          </div>
        </header>

        <main className="content">
          <section className="welcome welcome-row">
            <div>
              <p className="eyebrow">● &nbsp; {tab === "painel" ? todayLabel() : current.label.toUpperCase()}</p>
              <h1>
                {current.title} <em>{current.em}</em>
              </h1>
              <p className="subtitle">{current.sub}</p>
            </div>
            {tab === "painel" && (
              <div className="welcome-actions">
                <button className="btn quiet" onClick={() => setTab("importacao")}>↑ &nbsp; Importar planilha</button>
                <button className="btn" onClick={() => setTab("lancamentos")}>＋ &nbsp; Novo lançamento</button>
              </div>
            )}
          </section>

          {empty && tab === "painel" && (
            <section className="step-card">
              <span className="step-num">01</span>
              <div className="grow">
                <label>PRIMEIRO PASSO</label>
                <p>Informe sua renda e suas contas em Orçamento, logo abaixo, ou importe uma planilha. Depois registre os gastos do mês em Lançamentos.</p>
              </div>
              <button className="btn" onClick={() => setTab("importacao")}>Importar planilha →</button>
              <button className="btn-ghost" onClick={downloadTemplate}>Baixar modelo</button>
            </section>
          )}

          {tab === "painel" && !empty && (
            <section className="balance-hero" aria-label="Disponível no mês">
              <div className="balance-copy">
                <div className="balance-head">
                  <label>DISPONÍVEL NO MÊS</label>
                  <span className="hero-status"><i /> CALCULADO PELO MOTOR</span>
                </div>
                <p>
                  Renda − contas fixas − essenciais − mínimo de dívidas
                  {summary.entriesCount > 0 ? `, ajustado por ${summary.entriesCount} lançamento(s) de ${month}` : ""}
                </p>
                <strong className="num">{formatMoney(avail)}</strong>
                <div className="balance-bottom">
                  <span>Metas pedem {formatMoney(requested)}</span>
                  <span>{requested > avail ? "Não cabe tudo: use o simulador ✳" : "Todas as metas cabem"}</span>
                </div>
              </div>
              <div className="balance-art" aria-hidden="true">
                <div className="art-arc" />
                <div className="art-bars"><i /><i /><i /><i /><i /><i /></div>
                <span className="art-spark">✦</span>
              </div>
            </section>
          )}

          <Current state={state} onChange={setState} />
          <footer className="footer">
            O Gemma interpreta o pedido; todo cálculo é feito por um motor determinístico e testado.
          </footer>
        </main>
      </div>

      <aside className={chatOpen ? "chat open" : "chat"} aria-label="Simulador por linguagem natural">
        <button className="chat-close" onClick={() => setChatOpen(false)} aria-label="Fechar simulador">×</button>
        <Simulador state={state} onChange={setState} />
      </aside>

      <nav className="mobile-bar" aria-label="Navegação móvel">
        {TABS.filter((t) => t.id !== "importacao").map((t) => (
          <button key={t.id} className={tab === t.id && !chatOpen ? "active" : ""} onClick={() => { setTab(t.id); setChatOpen(false); }}>
            <i>{t.icon}</i>
            <span>{t.label.split(" ")[0]}</span>
          </button>
        ))}
        <button className={chatOpen ? "active" : ""} onClick={() => setChatOpen(true)}>
          <i>✳</i>
          <span>Simular</span>
        </button>
      </nav>
    </div>
  );
}
