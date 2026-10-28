import { useCallback } from "react";
import { useLastRun, setLastRun } from "../session";
import type { SectionProps } from "../props";
import type { PlanEvaluation, Goal, Priority, PlanLabel } from "../../contracts/types";
import { simulate } from "../../engine";
import { formatMoney } from "../../engine/money";
import { scenarioLabel, priorityLabel } from "../simulador/labels";

const PLAN_TITLES: Record<PlanLabel, string> = {
  gemma: "Plano do Gemma",
  otimizado: "Plano otimizado (algoritmo)",
  conservador: "Plano conservador (prioridade estrita)",
};

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
];

export function Comparador(props: SectionProps) {
  const { state, onChange } = props;
  const lastRun = useLastRun();

  if (!lastRun) {
    return (
      <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <header>
          <h2 style={{ marginBottom: "0.25rem" }}>Cenários</h2>
          <p className="muted" style={{ margin: 0 }}>Comparação lado a lado dos planos simulados.</p>
        </header>
        <div className="card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
          <p style={{ margin: "0 0 1rem", fontSize: "16px" }}>
            Nenhuma simulação realizada ainda.
          </p>
          <p className="muted" style={{ margin: "0 0 1.5rem" }}>
            Vá ao <strong>Simulador</strong> e faça uma pergunta para gerar os cenários.
          </p>
          <button
            className="btn"
            onClick={() => window.dispatchEvent(new CustomEvent("simfin:tab", { detail: "simulador" }))}
          >
            Ir para o Simulador
          </button>
        </div>
      </section>
    );
  }

  const { text, intent, result } = lastRun;

  const handlePriorityChange = useCallback(
    (goalId: string, newPriority: Priority) => {
      const updatedGoals = state.goals.map((g) =>
        g.id === goalId ? { ...g, priority: newPriority } : g
      );
      const newState = { ...state, goals: updatedGoals };
      onChange(newState);
      const newResult = simulate(newState, intent);
      setLastRun({ text, intent, result: newResult });
    },
    [state, intent, text, onChange]
  );

  const getGoalName = (goalId: string): string => {
    const goal = state.goals.find((g) => g.id === goalId);
    return goal?.name ?? goalId;
  };

  const renderPlanColumn = (plan: PlanEvaluation, index: number) => {
    const isOptimized = plan.plan.label === "otimizado";

    return (
      <div
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          borderWidth: isOptimized ? "2px" : "1px",
          borderColor: isOptimized ? "var(--primary)" : "var(--border)",
          boxShadow: isOptimized ? "0 4px 16px rgba(16, 185, 129, 0.15)" : "var(--shadow-1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0 }}>{PLAN_TITLES[plan.plan.label]}</h3>
          <span className={plan.valid ? "chip" : "chip err"}>{plan.valid ? "Válido" : "Inválido"}</span>
        </div>

        {plan.violations.length > 0 && (
          <ul style={{ margin: "0 0 0.75rem 1rem", padding: 0, color: "var(--error)", fontSize: "13px" }}>
            {plan.violations.map((v, i) => (
              <li key={i}>{v.detail}</li>
            ))}
          </ul>
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
          {plan.perGoal.map((pg) => {
            const goalName = getGoalName(pg.goalId);
            const pct = pg.requested > 0 ? Math.min(100, Math.round((pg.allocated / pg.requested) * 100)) : 100;
            const statusLabel = pg.status === "atendida" ? "Atendida" : pg.status === "reduzida" ? "Reduzida" : "Zerada";
            const statusClass = pg.status === "atendida" ? "" : pg.status === "reduzida" ? "warn" : "err";

            return (
              <div key={pg.goalId} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span>{goalName}</span>
                  <span className="num">{formatMoney(pg.allocated)} / {formatMoney(pg.requested)}</span>
                </div>
                <div className="progress">
                  <span style={{ width: `${pct}%` }}></span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span className="muted">{pg.status === "atendida" ? "Atendida" : pg.status === "reduzida" ? `Reduzida (${pct}%)` : "Zerada"}</span>
                  <span className={`chip ${statusClass}`} style={{ fontSize: "10px", textTransform: "capitalize" }}>
                    {statusLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "13px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="muted">Total alocado</span>
            <span className="num">{formatMoney(plan.total)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="muted">Sobra (disponível - total)</span>
            <span className={`num ${plan.leftover < 0 ? "chip err" : ""}`} style={{ background: "transparent", padding: 0 }}>
              {formatMoney(plan.leftover)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
            <span className="muted">Pontuação do algoritmo</span>
            <span className="num">{plan.score.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <header>
        <h2 style={{ marginBottom: "0.25rem" }}>Cenários</h2>
        <p className="muted" style={{ margin: 0 }}>Comparação lado a lado dos planos simulados.</p>
      </header>

      <div className="card">
        <h3 style={{ marginBottom: "0.5rem" }}>Pedido original</h3>
        <p style={{ margin: 0, fontStyle: "italic", whiteSpace: "pre-wrap" }}>"{text}"</p>
        <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "13px" }}>
          Cenário: {scenarioLabel(intent.scenario)}
          {intent.amount !== null && ` • Valor: ${formatMoney(intent.amount)}`}
          {intent.incomeChangePct !== null && ` • Variação de renda: ${intent.incomeChangePct > 0 ? "+" : ""}${intent.incomeChangePct}%`}
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: "0.75rem" }}>Prioridade das metas</h3>
        <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "13px" }}>
          Altere a prioridade para ver como a distribuição muda (o plano otimizado reage imediatamente).
        </p>
        <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {state.goals.map((goal) => (
            <label key={goal.id} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontWeight: 600, fontSize: "13px" }}>{goal.name}</span>
              <select
                className="input"
                value={goal.priority}
                onChange={(e) => handlePriorityChange(goal.id, e.target.value as Priority)}
                style={{ minHeight: "40px", padding: "0 0.5rem", fontSize: "13px" }}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {result.plans.map((plan, i) => renderPlanColumn(plan, i))}
      </div>

      <div className="card" style={{ background: "var(--tertiary)", borderColor: "var(--primary)" }}>
        <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
          <strong>Nota:</strong> Todos os planos, inclusive o do Gemma, passam pela mesma verificação do motor:
          nenhum pode exceder o disponível.
        </p>
      </div>
    </section>
  );
}