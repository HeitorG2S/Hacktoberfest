import { useState, useCallback, useEffect, useRef, FormEvent, KeyboardEvent } from "react";
import type { SectionProps } from "../props";
import type { Entry, Intent, ProposedEntry, RagAnswer, RetrievedDoc, SimulationResult, Goal, Priority, ScenarioType } from "../../contracts/types";
import { interpret, MAX_INPUT_LENGTH } from "../../llm/client";
import { simulate, matchGoal, currentMonth, today } from "../../engine";
import { retrieveDocs } from "../../rag/retrieve";
import { answerWithDocs } from "../../rag/answer";
import { quickRoute } from "../../rag/router";
import { buildLlmContext, isDemoData } from "../../llm/context";
import { setLastRun } from "../session";
import { formatMoney } from "../../engine/money";
import { scenarioLabel, priorityLabel } from "./labels";

const EXAMPLE_PROMPTS = [
  "Gastei R$ 45,90 no mercado hoje",
  "Consigo pedir um iFood de R$ 60 hoje sem estourar minhas metas?",
  "Onde invisto o que sobra no mês?",
  "Quanto gastei com delivery este mês?",
  "Como está a PETR4? Quantas cotas compro com R$ 500?",
  "Quanto rende guardar R$ 200 por mês durante 2 anos?",
  "Divida o que sobrou do mês entre as minhas metas, sem ultrapassar o disponível.",
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
  // registrar_gasto: lançamentos propostos pelo agente, que só entram com a confirmação do usuário
  proposed?: ProposedEntry[];
  entryStatus?: "pendente" | "adicionado" | "cancelado";
  // investimento: resposta do RAG com a Brapi
  rag?: { answer: RagAnswer; docs: RetrievedDoc[]; errors: string[] };
}

const CATEGORY_LABEL: Record<string, string> = {
  salario: "Salário", moradia: "Moradia", contas: "Contas", mercado: "Mercado", transporte: "Transporte",
  saude: "Saúde", educacao: "Educação", lazer: "Lazer", divida: "Dívida", outros: "Outros",
};

export function Simulador(props: SectionProps) {
  const { state, onChange } = props;
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  // Padrão: NÃO enviar o orçamento ao Gemma (dado real do usuário); ele marca se quiser.
  const [sendContext, setSendContext] = useState(() => isDemoData(state));
  const [lastIntentSource, setLastIntentSource] = useState<"api" | "mock" | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  const handleExampleClick = useCallback((prompt: string) => {
    setInput(prompt);
    setError(null);
  }, []);

  // Envia uma pergunta (do campo de texto ou de um atalho como "Perguntas para explorar").
  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userText = text.trim();
      setInput("");
      setError(null);
      setLoading(true);

      const userMsg: ChatMessage = { role: "user", content: userText };
      setHistory((h) => [...h, userMsg]);

      try {
        // Privacidade (regra 2 do projeto): sem a opção marcada, nem os nomes das metas vão ao Gemma;
        // a correspondência com as metas cadastradas é feita localmente pelo motor (matchGoal).
        const goalNames = sendContext ? state.goals.map((g) => g.name) : [];
        const context = sendContext ? buildLlmContext(state) : undefined;
        // Etapa 1 (roteamento): perguntas comuns são respondidas localmente, sem chamar a IA.
        const quick = quickRoute(userText);
        const intent = quick ?? (await interpret(userText, goalNames, { context, todayIso: today() }));
        if (!quick) {
          setLastIntentSource(intent.source);
          setFallbackReason(intent.fallbackReason ?? null);
        }

        if (intent.scenario === "registrar_gasto") {
          const msg: ChatMessage = intent.entries.length
            ? { role: "assistant", content: "", intent, proposed: intent.entries, entryStatus: "pendente" }
            : { role: "assistant", content: "Entendi que você quer registrar um lançamento, mas não identifiquei o valor. Ex.: \"gastei R$ 45 no mercado\"." };
          setHistory((h) => [...h, msg]);
          return;
        }

        if (intent.scenario === "investimento" || intent.scenario === "pode_gastar" || intent.scenario === "consulta") {
          // Etapas 2–4: recuperação nos dados locais (+ Brapi), prompt com os dados calculados, geração conferida.
          const { docs, errors, draft } = await retrieveDocs(intent, state, { month: currentMonth(), today: today(), includeBudget: sendContext });
          const answer = quick
            ? await answerWithDocs(userText, docs, { errors, draft, mode: "mock" }).then((a) => ({ ...a, source: "local" as const }))
            : await answerWithDocs(userText, docs, { errors, draft, allowPersonal: sendContext, mode: intent.source === "mock" ? "mock" : undefined });
          setHistory((h) => [...h, { role: "assistant", content: "", intent, rag: { answer, docs, errors } }]);
          return;
        }

        const result = simulate(state, intent, { month: currentMonth() });

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
    [loading, state, sendContext, onChange]
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      void send(input);
    },
    [send, input],
  );

  // Atalhos de outras telas: window.dispatchEvent(new CustomEvent("simfin:ask", { detail: "pergunta" })).
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (typeof q === "string" && q.trim()) void sendRef.current(q);
    };
    window.addEventListener("simfin:ask", onAsk);
    return () => window.removeEventListener("simfin:ask", onAsk);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter envia; Shift+Enter quebra a linha.
      if (e.key === "Enter" && !e.shiftKey && !loading && input.trim()) {
        e.preventDefault();
        handleSubmit(e as unknown as FormEvent);
      }
    },
    [input, loading, handleSubmit]
  );

  const confirmEntries = (index: number) => {
    const msg = history[index];
    if (!msg?.proposed || msg.entryStatus !== "pendente") return;
    const existing = new Set(state.entries.map((e) => e.id));
    const added: Entry[] = msg.proposed.map((p) => {
      let id = crypto.randomUUID();
      while (existing.has(id)) id = crypto.randomUUID();
      existing.add(id);
      const description = p.description.charAt(0).toUpperCase() + p.description.slice(1);
      return { id, date: p.date ?? today(), description, amount: p.amount, type: p.type, categorySlug: p.categorySlug, source: "agente" };
    });
    onChange({ ...state, entries: [...state.entries, ...added] });
    setHistory((h) => h.map((m, i) => (i === index ? { ...m, entryStatus: "adicionado" } : m)));
  };

  const cancelEntries = (index: number) => setHistory((h) => h.map((m, i) => (i === index ? { ...m, entryStatus: "cancelado" } : m)));

  const renderEntryConfirm = (msg: ChatMessage, index: number) => (
    <div className="card">
      <h3>Registrar {msg.proposed!.length === 1 ? "lançamento" : `${msg.proposed!.length} lançamentos`}?</h3>
      <table>
        <tbody>
          {msg.proposed!.map((p, k) => (
            <tr key={k}>
              <td>{p.date ? p.date.split("-").reverse().join("/") : "hoje"}</td>
              <td>
                {p.description}
                <br />
                <span className="muted">{CATEGORY_LABEL[p.categorySlug] ?? p.categorySlug}</span>
              </td>
              <td className="num" style={{ color: p.type === "receita" ? "var(--primary)" : "var(--ink)" }}>
                {p.type === "receita" ? "+" : "−"} {formatMoney(p.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg.entryStatus === "pendente" ? (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button className="btn" onClick={() => confirmEntries(index)}>Adicionar</button>
          <button className="btn-ghost" onClick={() => cancelEntries(index)}>Cancelar</button>
        </div>
      ) : (
        <p style={{ margin: "0.75rem 0 0" }}>
          {msg.entryStatus === "adicionado" ? (
            <>
              <span className="chip">Adicionado</span>{" "}
              <button className="link-btn" onClick={() => window.dispatchEvent(new CustomEvent("simfin:tab", { detail: "lancamentos" }))}>Ver lançamentos →</button>
            </>
          ) : (
            <span className="chip warn">Cancelado</span>
          )}
        </p>
      )}
      <p className="muted" style={{ fontSize: "12px", margin: "0.5rem 0 0" }}>O assistente só registra depois da sua confirmação. Confira valor e categoria.</p>
    </div>
  );

  const renderRag = (rag: NonNullable<ChatMessage["rag"]>) => (
    <div className="card-insight">
      <h3>✦ {rag.docs.some((d) => d.source === "brapi") ? "Resposta com seus dados e a Brapi" : "Resposta com os seus dados"}</h3>
      <p style={{ margin: "0 0 0.5rem" }}>{rag.answer.answer}</p>
      <p className="muted" style={{ fontSize: "12px", margin: "0 0 0.25rem" }}>
        {rag.answer.source === "api"
          ? "Redigido pelo Gemma a partir dos dados abaixo; números conferidos pelo app."
          : rag.answer.source === "local"
            ? rag.docs.some((d) => d.personal) && !sendContext
              ? "Respondido no seu navegador, sem IA externa (marque a opção acima para o Gemma redigir com seus dados)."
              : "Respondido no seu navegador, sem IA externa."
            : "Montado diretamente dos dados abaixo."}
      </p>
      {rag.docs.length > 0 && (
        <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem", fontSize: "12px" }}>
          {rag.docs
            .filter((d) => rag.answer.citations.includes(d.id))
            .map((d) => (
              <li key={d.id}>
                <span className={d.source === "brapi" ? "chip" : "chip warn"}>{d.source === "brapi" ? "Brapi" : "Motor"}</span>{" "}
                {d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.title}</a> : d.title}
              </li>
            ))}
        </ul>
      )}
      {rag.errors.length > 0 && <p style={{ color: "var(--error)", fontSize: "12px", margin: "0.5rem 0 0" }}>{rag.errors.join(" · ")}</p>}
      <button className="btn-ghost" style={{ marginTop: "0.75rem" }} onClick={() => window.dispatchEvent(new CustomEvent("simfin:tab", { detail: "investimentos" }))}>
        Abrir Investimentos →
      </button>
    </div>
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
          <b>Converse com seus dados</b>
          <small><i /> Assistente · o Gemma interpreta, o app calcula</small>
        </div>
        {modeChip}
      </header>
      {fallbackReason && (
        <div className="chat-privacy" role="status" style={{ borderColor: "#f3d9a8", background: "#fffaf0", color: "#8a5a00" }}>
          {fallbackReason}
        </div>
      )}
      <div className="chat-privacy">
        <label>
          <input type="checkbox" checked={sendContext} onChange={(e) => setSendContext(e.target.checked)} />
          <span>Enviar resumo do orçamento ao Gemma (permite que ele proponha um plano)</span>
        </label>
        <small>Dados reais não devem ser enviados a serviços externos; com dados de demonstração é seguro.</small>
      </div>

      <div className="messages" aria-live="polite">
        <div className="date-line">HOJE</div>
        {history.length === 0 && (
          <div className="message assistant">
            <span className="msg-avatar">✳</span>
            <div className="bubble">
              Posso registrar seus gastos ("gastei R$ 45 no mercado"), consultar cotações na Brapi ("como está a PETR4?")
              e simular decisões (uma compra, uma meta com prazo, uma perda de renda). Eu interpreto; as contas são do motor do app.
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
                {msg.proposed ? (
                  renderEntryConfirm(msg, i)
                ) : msg.rag ? (
                  renderRag(msg.rag)
                ) : msg.intent && msg.result ? (
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
        <label>EXPERIMENTE PERGUNTAR</label>
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
          placeholder="Pergunte sobre seus dados…"
          rows={2}
          disabled={loading}
          aria-label="Pergunte sobre seus dados"
          maxLength={MAX_INPUT_LENGTH}
        />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Enviar">
          {loading ? "…" : "→"}
        </button>
        <small>Enter para enviar · Shift+Enter para nova linha</small>
      </form>
    </section>
  );
}