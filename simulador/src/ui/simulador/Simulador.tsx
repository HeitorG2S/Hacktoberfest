import { useState, useCallback, useEffect, FormEvent, KeyboardEvent } from "react";
import type { SectionProps } from "../props";
import type { Intent, SimulationResult, Goal, Priority, ScenarioType } from "../../contracts/types";
import { interpret } from "../../llm/client";
import { simulate, matchGoal } from "../../engine";
import { buildLlmContext, isDemoData } from "../../llm/context";
import { setLastRun } from "../session";
import { formatMoney } from "../../engine/money";
import { scenarioLabel, priorityLabel } from "./labels";

const EXAMPLE_PROMPTS = [
  "Quero guardar dinheiro para emergências, comprar um computador e ainda ter um pouco para lazer. Encontre uma divisão equilibrada sem ultrapassar o que tenho disponível.",
  "Quero comprar um computador de R$ 1.800 em seis meses, sem deixar de guardar dinheiro",
  "Consigo comprar um celular de R$ 2.000 este mês?",
  "Se surgir uma despesa inesperada de R$ 400, de onde tiro o dinheiro?",
  "É melhor acelerar o pagamento da dívida ou montar uma reserva?",
  "E se eu perder 30% da minha renda?",
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  intent?: Intent;
  result?: SimulationResult;
}

export function Simulador(props: SectionProps) {
  const { state, onChange } = props;
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [sendContext, setSendContext] = useState(() => isDemoData(state));
  const [lastIntentSource, setLastIntentSource] = useState<"api" | "mock" | null>(null);

  useEffect(() => {
    setSendContext(isDemoData(state));
  }, [state]);

  const handleExampleClick = useCallback((prompt: string) => {
    setInput(prompt);
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || loading) return;

      const userText = input.trim();
      setInput("");
      setError(null);
      setLoading(true);

      const userMsg: ChatMessage = { role: "user", content: userText };
      setHistory((h) => [...h, userMsg]);

      try {
        const goalNames = state.goals.map((g) => g.name);
        const context = sendContext ? buildLlmContext(state) : undefined;
        const intent = await interpret(userText, goalNames, { context });

        setLastIntentSource(intent.source);
        const result = simulate(state, intent);

        const assistantMsg: ChatMessage = { role: "assistant", content: "", intent, result };
        setHistory((h) => [...h, assistantMsg]);
        setLastRun({ text: userText, intent, result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro inesperado ao simular.";
        setError(msg);
        setHistory((h) => [...h, { role: "assistant", content: msg }]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, state, sendContext, onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !loading && input.trim()) {
        e.preventDefault();
        handleSubmit(e as unknown as FormEvent);
      }
    },
    [input, loading, handleSubmit]
  );

  const renderInterpretation = (intent: Intent) => {
    const goalsWithDetails = intent.goals.map((ig) => {
      const matched = matchGoal(state.goals, ig.name);
      return {
        name: ig.name,
        amount: ig.amount !== null ? formatMoney(ig.amount) : "—",
        deadline: ig.deadlineMonths !== null ? `${ig.deadlineMonths} meses` : "—",
        priority: ig.priority !== null ? priorityLabel(ig.priority) : "—",
        matched: !!matched,
      };
    });

    return (
      <div className="card">
        <h3>O que o Gemma entendeu</h3>
        <p className="muted" style={{ fontSize: "13px" }}>
          Isto é apenas a interpretação da frase; o motor de cálculo valida e simula abaixo.
        </p>
        <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <span className="chip">Cenário: {scenarioLabel(intent.scenario)}</span>
          {intent.amount !== null && (
            <span className="chip">Valor: {formatMoney(intent.amount)}</span>
          )}
          {intent.incomeChangePct !== null && (
            <span className="chip">{intent.incomeChangePct > 0 ? "+" : ""}{intent.incomeChangePct}% renda</span>
          )}
        </div>
        {goalsWithDetails.length > 0 && (
          <div style={{ marginTop: "0.75rem" }}>
            <strong>Metas citadas:</strong>
            <ul style={{ margin: "0.5rem 0 0 1rem", padding: 0 }}>
              {goalsWithDetails.map((g, i) => (
                <li key={i} style={{ marginBottom: "0.25rem" }}>
                  <strong>{g.name}</strong> — valor: {g.amount}, prazo: {g.deadline}, prioridade: {g.priority}
                  {!g.matched && <span className="chip warn" style={{ marginLeft: "0.5rem", fontSize: "10px" }}>Não cadastrada</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {intent.missing.length > 0 && (
          <div style={{ marginTop: "0.75rem" }}>
            <strong>Informações faltando:</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.25rem" }}>
              {intent.missing.map((m, i) => (
                <span key={i} className="chip warn">
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}
        {intent.proposedAllocation.length > 0 && (
          <div style={{ marginTop: "0.75rem" }}>
            <strong>Plano proposto pelo Gemma:</strong>
            <ul style={{ margin: "0.5rem 0 0 1rem", padding: 0 }}>
              {intent.proposedAllocation.map((p, i) => (
                <li key={i}>
                  {p.goal}: {formatMoney(p.amount)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderEngineResult = (result: SimulationResult) => (
    <div className="card-insight">
      <h3>✦ Resultado do motor</h3>
      <div style={{ marginBottom: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <span className={result.feasible ? "chip" : "chip err"}>
          {result.feasible ? "Cabe no orçamento" : "Não cabe tudo"}
        </span>
        <span className="metric num" style={{ color: result.available < 0 ? "var(--error)" : "var(--ink)" }}>
          Disponível usado: {formatMoney(result.available)}
        </span>
      </div>
      <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
        {result.explanation.map((line, i) => (
          <li key={i} style={{ marginBottom: "0.25rem", lineHeight: 1.5 }}>{line}</li>
        ))}
      </ul>
    </div>
  );

  const renderConsequences = (consequences: SimulationResult["consequences"]) => {
    if (consequences.length === 0) return null;

    return (
      <div className="card">
        <h3>Consequências</h3>
        <table>
          <thead>
            <tr>
              <th>Indicador</th>
              <th className="num">Antes</th>
              <th className="num">Depois</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {consequences.map((c, i) => (
              <tr key={i}>
                <td>{c.label}</td>
                <td className="num">{c.before !== null ? formatMoney(c.before) : "—"}</td>
                <td className="num">{c.after !== null ? formatMoney(c.after) : "—"}</td>
                <td>{c.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderLastMessage = () => {
    const last = history[history.length - 1];
    if (!last || last.role !== "assistant" || !last.intent || !last.result) return null;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {renderInterpretation(last.intent)}
        {renderEngineResult(last.result)}
        {renderConsequences(last.result.consequences)}
        <button
          className="btn"
          onClick={() => window.dispatchEvent(new CustomEvent("simfin:tab", { detail: "comparador" }))}
          style={{ alignSelf: "flex-start", marginTop: "0.5rem" }}
        >
          Comparar cenários →
        </button>
      </div>
    );
  };

  const modeChip = lastIntentSource
    ? lastIntentSource === "api"
      ? <span className="chip">Gemma 4 · API</span>
      : <span className="chip warn" title="A API não respondeu ou não há chave: interpretação local de demonstração">Modo mock</span>
    : null;

  return (
    <section className="sim">
      <header className="chat-head">
        <span className="chat-logo">✳</span>
        <div>
          <b>Simulador de decisões</b>
          <small><i /> O Gemma interpreta · o motor calcula</small>
        </div>
        {modeChip}
      </header>
      <div className="chat-privacy">
        <label>
          <input type="checkbox" checked={sendContext} onChange={(e) => setSendContext(e.target.checked)} />
          <span>Enviar resumo do orçamento ao Gemma (permite que ele proponha um plano)</span>
        </label>
        <small>Dados reais não devem ser enviados a serviços externos; com dados de demonstração é seguro.</small>
      </div>

      <div className="messages" aria-live="polite">
        {history.length === 0 && (
          <div className="message assistant">
            <span className="msg-avatar">✳</span>
            <div className="bubble">
              Descreva uma decisão em linguagem natural, por exemplo uma compra, uma meta com prazo ou uma perda de renda.
              Eu interpreto o pedido e o motor simula as consequências antes de você decidir.
            </div>
          </div>
        )}
        {history.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="message user">
              <div className="bubble">{msg.content}</div>
            </div>
          ) : (
            <div key={i} className="message assistant">
              <span className="msg-avatar">✳</span>
              <div className="bubble wide">
                {msg.intent && msg.result ? (
                  <>
                    {renderInterpretation(msg.intent)}
                    {renderEngineResult(msg.result)}
                    {renderConsequences(msg.result.consequences)}
                    <button
                      className="btn"
                      onClick={() => window.dispatchEvent(new CustomEvent("simfin:tab", { detail: "comparador" }))}
                    >
                      Comparar cenários →
                    </button>
                  </>
                ) : (
                  <p style={{ margin: 0, color: "var(--error)" }}>{msg.content}</p>
                )}
              </div>
            </div>
          ),
        )}
        {loading && (
          <div className="message assistant">
            <span className="msg-avatar">✳</span>
            <div className="bubble muted">Interpretando…</div>
          </div>
        )}
        {error && (
          <div className="card" style={{ background: "var(--error-bg)", borderColor: "var(--error)" }}>
            <span className="chip err">Erro</span>
            <p style={{ margin: "0.5rem 0 0", color: "var(--error)" }}>{error}</p>
          </div>
        )}
      </div>

      <div className="suggestions">
        {EXAMPLE_PROMPTS.map((prompt, i) => (
          <button key={i} type="button" onClick={() => handleExampleClick(prompt)} title={prompt}>
            {prompt.length > 46 ? `${prompt.slice(0, 46)}…` : prompt}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Descreva sua decisão… (Ctrl+Enter envia)"
          rows={2}
          disabled={loading}
          aria-label="Descreva sua decisão"
        />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Simular">
          {loading ? "…" : "↑"}
        </button>
      </form>
    </section>
  );
}