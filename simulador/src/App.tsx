import { useEffect, useState } from "react";
import { useFinancialState } from "./store";
import { available, formatMoney, totalRequested } from "./engine";
import { isDemoData } from "./llm/context";
import { Painel } from "./ui/painel/Painel";
import { Objetivos } from "./ui/objetivos/Objetivos";
import { Importacao } from "./ui/importacao/Importacao";
import { Simulador } from "./ui/simulador/Simulador";
import { Comparador } from "./ui/comparador/Comparador";

// Layout inspirado no painel "Clareza" (painel-financeiro-interface.zip): barra lateral, centro com as
// seções e o chat (Simulador) fixo à direita; no tablet o chat vira gaveta e no celular há barra inferior.
const TABS = [
  { id: "painel", label: "Visão geral", icon: "◫", title: "Mais clareza para", em: "suas escolhas.", sub: "Renda, contas e o que sobra para as suas metas.", C: Painel },
  { id: "comparador", label: "Laboratório", icon: "⚖", title: "Compare antes de", em: "decidir.", sub: "Plano do Gemma, plano do algoritmo e plano conservador, todos verificados pelo mesmo motor.", C: Comparador },
  { id: "objetivos", label: "Objetivos", icon: "◎", title: "Metas com", em: "prioridade.", sub: "Valor desejado, prazo e prioridade de cada objetivo.", C: Objetivos },
  { id: "importacao", label: "Importar extrato", icon: "↑", title: "Traga seus", em: "lançamentos.", sub: "O arquivo é lido só no navegador; mostramos o que entrou, o que saiu e por quê.", C: Importacao },
] as const;
type TabId = (typeof TABS)[number]["id"] | "simulador";

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
    window.addEventListener("simfin:tab", onTab);
    return () => window.removeEventListener("simfin:tab", onTab);
  }, []);

  const current = TABS.find((t) => t.id === tab)!;
  const Current = current.C;
  const avail = available(state.budget);
  const requested = totalRequested(state.goals);
  const demo = isDemoData(state);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✳</span>
          <b>clareza<span>.</span></b>
        </div>
        <p className="side-label">LABORATÓRIO DE DECISÕES</p>
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
          <button className="demo-link" onClick={reset}>↺ &nbsp; Restaurar demonstração</button>
        </div>
      </aside>

      <div className="center">
        <header className="topbar">
          <div>
            <span className="green-dot" /> <span className="crumb-root">Simulador de decisões</span> <span className="slash">/</span> <b>{current.label}</b>
          </div>
          <div className="top-actions">
            <span className="privacy"><i /> Dados locais</span>
            <button className="mobile-chat" onClick={() => setChatOpen(true)} aria-label="Abrir simulador">✳</button>
          </div>
        </header>

        <main className="content">
          <section className="welcome">
            <p className="eyebrow">✳ &nbsp; {current.label.toUpperCase()}</p>
            <h1>
              {current.title} <em>{current.em}</em>
            </h1>
            <p className="subtitle">{current.sub}</p>
          </section>

          {demo && (
            <section className="notice">
              <span className="demo-tag">△ DEMONSTRAÇÃO</span>
              <span>Os valores exibidos são fictícios. Importe um extrato para usar os seus.</span>
              <button className="link-btn" onClick={() => setTab("importacao")}>Importar →</button>
            </section>
          )}

          {tab === "painel" && (
            <section className="balance-hero" aria-label="Disponível no mês">
              <div className="balance-copy">
                <div className="balance-head">
                  <label>DISPONÍVEL NO MÊS</label>
                  <span className="hero-status"><i /> CALCULADO PELO MOTOR</span>
                </div>
                <p>Renda − contas fixas − essenciais − mínimo de dívidas</p>
                <strong className="num">{formatMoney(avail)}</strong>
                <div className="balance-bottom">
                  <span>Metas pedem {formatMoney(requested)}</span>
                  <span>{requested > avail ? "Não cabe tudo: use o simulador ✳" : "Todas as metas cabem"}</span>
                </div>
              </div>
              <div className="balance-art" aria-hidden="true">
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
        {TABS.map((t) => (
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
