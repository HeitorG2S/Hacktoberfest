import { useState } from "react";
import type { SectionProps } from "../props";
import type { Goal, Priority, FinancialState } from "../../contracts/types";
import { validateGoalForm, goalToForm, type GoalForm } from "./form";
import { parseMoney, formatMoney, monthlyRequest } from "../../engine";
import { goalOverview } from "./overview";

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
];

function priorityClass(p: Priority): string {
  return p === "alta" ? "chip" : p === "media" ? "chip warn" : "chip err";
}

function formatMonths(months: number | null): string {
  return months !== null ? `${months} meses` : "Mensal";
}

export function Objetivos(props: SectionProps) {
  const { state, onChange } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GoalForm>({
    name: "",
    target: "",
    saved: "",
    deadlineMonths: "",
    priority: "media",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof GoalForm, string>>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");

  const existingIds = state.goals.map((g) => g.id);
  const overview = goalOverview(state.goals);

  function resetForm() {
    setForm({ name: "", target: "", saved: "", deadlineMonths: "", priority: "media" });
    setErrors({});
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateGoalForm(form, existingIds.filter((id) => id !== editingId));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const newGoals = editingId
      ? state.goals.map((g) => (g.id === editingId ? result.goal : g))
      : [...state.goals, result.goal];
    onChange({ ...state, goals: newGoals });
    setEditingId(null);
    setShowCreateForm(false);
    resetForm();
  }

  function startEdit(goal: Goal) {
    setEditingId(goal.id);
    setShowCreateForm(true);
    setForm(goalToForm(goal));
    setErrors({});
  }

  function handleDelete(id: string) {
    onChange({ ...state, goals: state.goals.filter((g) => g.id !== id) });
    if (editingId === id) {
      setEditingId(null);
      setShowCreateForm(false);
      resetForm();
    }
  }

  function handlePriorityChange(id: string, priority: Priority) {
    onChange({
      ...state,
      goals: state.goals.map((g) => (g.id === id ? { ...g, priority } : g)),
    });
  }

  function handleChange<K extends keyof GoalForm>(field: K, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function cancelEdit() {
    setEditingId(null);
    setShowCreateForm(false);
    resetForm();
  }

  const filteredGoals = state.goals.filter((g) => {
    if (filter === "active") return g.saved < g.target;
    if (filter === "done") return g.saved >= g.target;
    return true;
  });

  return (
    <section className="section-card" aria-labelledby="goalsTitle">
      <div className="section-head">
        <div>
          <span className="section-eyebrow">PLANOS EM ACOMPANHAMENTO</span>
          <h2 id="goalsTitle">Metas que saem do papel</h2>
          <p>Defina um valor, acompanhe o avanço e ajuste o plano quando precisar.</p>
        </div>
        <button className="btn" type="button" onClick={() => { setShowCreateForm(true); setEditingId(null); resetForm(); }}>
          + Criar meta
        </button>
      </div>

      <div className="goal-overview" aria-live="polite">
        <div className="goal-stat">
          <span>Em andamento<small>{overview.active} meta{overview.active !== 1 ? "s" : ""}</small></span>
          <b>{overview.active}</b>
        </div>
        <div className="goal-stat">
          <span>Concluídas<small>{overview.done} meta{overview.done !== 1 ? "s" : ""}</small></span>
          <b>{overview.done}</b>
        </div>
        <div className="goal-stat">
          <span>Falta completar</span>
          <b>{formatMoney(overview.missing)}</b>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "9px", color: "var(--ink-muted)", fontSize: "13px" }}>
        <span>Suas metas ficam salvas neste navegador. Atualize o progresso manualmente.</span>
        <label style={{ display: "flex", alignItems: "center", gap: "7px", flex: "0 0 auto" }}>
          Mostrar
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "active" | "done")}
            style={{ height: "30px", padding: "0 25px 0 8px", border: "1px solid #e1e9e2", borderRadius: "7px", background: "#fff", color: "#4d6355", fontSize: "13px" }}
          >
            <option value="all">Todas</option>
            <option value="active">Em andamento</option>
            <option value="done">Concluídas</option>
          </select>
        </label>
      </div>

      {showCreateForm && (
        <form className="card" onSubmit={handleSubmit} style={{ marginBottom: "16px" }}>
          <h3>{editingId ? "Editar meta" : "Nova meta"}</h3>
          <div style={{ display: "grid", gap: "1rem" }}>
            <label>
              Nome
              <input
                className="input"
                type="text"
                maxLength={60}
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Ex.: Reserva de emergência"
              />
              {errors.name && <span style={{ color: "var(--error)", fontSize: "12px" }}>{errors.name}</span>}
            </label>
            <label>
              Valor desejado
              <input
                className="input"
                type="text"
                value={form.target}
                onChange={(e) => handleChange("target", e.target.value)}
                placeholder="Ex.: 1.234,56"
              />
              {errors.target && <span style={{ color: "var(--error)", fontSize: "12px" }}>{errors.target}</span>}
            </label>
            <label>
              Já guardado (opcional)
              <input
                className="input"
                type="text"
                value={form.saved}
                onChange={(e) => handleChange("saved", e.target.value)}
                placeholder="Ex.: 200,00"
              />
              {errors.saved && <span style={{ color: "var(--error)", fontSize: "12px" }}>{errors.saved}</span>}
            </label>
            <label>
              Prazo em meses (opcional)
              <input
                className="input"
                type="text"
                value={form.deadlineMonths}
                onChange={(e) => handleChange("deadlineMonths", e.target.value)}
                placeholder="Ex.: 6"
              />
              {errors.deadlineMonths && (
                <span style={{ color: "var(--error)", fontSize: "12px" }}>{errors.deadlineMonths}</span>
              )}
            </label>
            <label>
              Prioridade
              <select
                className="input"
                value={form.priority}
                onChange={(e) => handleChange("priority", e.target.value as Priority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              {errors.priority && <span style={{ color: "var(--error)", fontSize: "12px" }}>{errors.priority}</span>}
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button className="btn" type="submit">
              {editingId ? "Salvar alterações" : "Adicionar meta"}
            </button>
            <button className="btn-ghost" type="button" onClick={cancelEdit}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {filteredGoals.length > 0 && (
        <div className="goals-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "9px" }} aria-live="polite">
          {filteredGoals.map((goal) => (
            <div key={goal.id} className="card" style={{ display: "flex", flexDirection: "column", minHeight: "208px", padding: "13px", boxShadow: "0 3px 12px rgba(20, 45, 32, 0.03)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span className="kpi-icon" style={{ width: "30px", height: "30px", fontSize: "14px" }}>◎</span>
                <span className={priorityClass(goal.priority)}>{goal.priority === "alta" ? "Alta" : goal.priority === "media" ? "Média" : "Baixa"}</span>
              </div>
              <h3 style={{ margin: "3px 0 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "15px", fontWeight: "720" }}>{goal.name}</h3>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", color: "#3e5946", fontSize: "13px", fontWeight: "680", marginBottom: "7px" }}>
                <span>R$ <b>{formatMoney(goal.saved).replace("R$ ", "")}</b> de R$ <b>{formatMoney(goal.target).replace("R$ ", "")}</b></span>
                <small style={{ color: "#99a49b", fontSize: "11px", fontWeight: "500" }}>{goal.saved >= goal.target ? "Concluída" : "Em andamento"}</small>
              </div>
              <div className="progress" style={{ height: "7px", borderRadius: "10px", background: "#edf2ec", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${Math.min(100, goal.target > 0 ? Math.round((goal.saved / goal.target) * 100) : 0)}%`, background: goal.saved >= goal.target ? "linear-gradient(90deg, #238255, #63bd82)" : "linear-gradient(90deg, #46a76b, #a0d66e)", transition: "width .4s ease" }}></span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "5px", color: "#89958c", fontSize: "12px", marginBottom: "9px" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Prazo: {formatMonths(goal.deadlineMonths)}</span>
                <b style={{ flex: "0 0 auto", color: "#607568", fontWeight: "650" }}>{formatMoney(monthlyRequest(goal))}/mês</b>
              </div>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", marginTop: "auto", paddingTop: "11px" }}>
                <select
                  className="input"
                  style={{ width: "100%", flex: "1 1 100%" }}
                  value={goal.priority}
                  onChange={(e) => handlePriorityChange(goal.id, e.target.value as Priority)}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-ghost"
                  style={{ padding: "0.25rem 0.5rem", minHeight: "auto", flex: 1 }}
                  onClick={() => startEdit(goal)}
                >
                  Editar
                </button>
                <button
                  className="btn-ghost"
                  style={{ padding: "0.25rem 0.5rem", minHeight: "auto", flex: 1, color: "var(--error)", borderColor: "var(--error)" }}
                  onClick={() => handleDelete(goal.id)}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {state.goals.length === 0 && !showCreateForm && (
        <div className="empty-dashed" style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "22px", border: "1.5px dashed #d5e3d9", borderRadius: "14px", background: "#fbfdfb" }}>
          <span style={{ display: "grid", width: "39px", height: "39px", flex: "0 0 auto", placeItems: "center", borderRadius: "12px", background: "#eaf5e9", color: "#378153", fontSize: "19px" }}>◎</span>
          <div>
            <b style={{ color: "#3a5642", fontSize: "14px", display: "block" }}>Sua próxima conquista começa com um plano.</b>
            <p style={{ maxWidth: "590px", margin: "4px 0 0", color: "#849188", fontSize: "12px", lineHeight: "1.65" }}>Crie uma meta de reserva, viagem, compra planejada ou quitação de dívida.</p>
            <button className="btn" type="button" onClick={() => { setShowCreateForm(true); resetForm(); }} style={{ marginTop: "9px", minHeight: "31px", fontSize: "13px" }}>Criar minha primeira meta</button>
          </div>
        </div>
      )}

      {state.goals.length > 0 && filteredGoals.length === 0 && (
        <div className="empty-dashed" style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "22px", border: "1.5px dashed #d5e3d9", borderRadius: "14px", background: "#fbfdfb" }}>
          <span style={{ display: "grid", width: "39px", height: "39px", flex: "0 0 auto", placeItems: "center", borderRadius: "12px", background: "#eaf5e9", color: "#378153", fontSize: "19px" }}>◎</span>
          <div>
            <b style={{ color: "#3a5642", fontSize: "14px", display: "block" }}>{filter === "active" ? "Nenhuma meta em andamento." : "Nenhuma meta concluída."}</b>
            <p style={{ maxWidth: "590px", margin: "4px 0 0", color: "#849188", fontSize: "12px", lineHeight: "1.65" }}>{filter === "active" ? "Todas as suas metas foram concluídas. Que tal criar uma nova?" : "Continue acompanhando suas metas em andamento."}</p>
          </div>
        </div>
      )}
    </section>
  );
}