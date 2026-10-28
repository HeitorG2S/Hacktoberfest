import { useState } from "react";
import type { SectionProps } from "../props";
import type { Goal, Priority, FinancialState } from "../../contracts/types";
import { validateGoalForm, goalToForm, type GoalForm } from "./form";
import { parseMoney, formatMoney, MoneyError } from "../../engine/money";

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
];

function priorityClass(p: Priority): string {
  return p === "alta" ? "chip" : p === "media" ? "chip warn" : "chip err";
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

  const existingIds = state.goals.map((g) => g.id);

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
    resetForm();
  }

  function startEdit(goal: Goal) {
    setEditingId(goal.id);
    setForm(goalToForm(goal));
    setErrors({});
  }

  function handleDelete(id: string) {
    onChange({ ...state, goals: state.goals.filter((g) => g.id !== id) });
    if (editingId === id) {
      setEditingId(null);
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

  return (
    <section>
      <h2>Objetivos</h2>

      <form className="card" onSubmit={handleSubmit}>
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
          {editingId && (
            <button className="btn-ghost" type="button" onClick={() => { setEditingId(null); resetForm(); }}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {state.goals.length > 0 && (
        <div className="card">
          <h3>Suas metas</h3>
          <table>
            <thead>
              <tr>
                <th>Meta</th>
                <th className="num">Desejado</th>
                <th className="num">Guardado</th>
                <th>Prazo</th>
                <th>Prioridade</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {state.goals.map((goal) => (
                <tr key={goal.id}>
                  <td>{goal.name}</td>
                  <td className="num">{formatMoney(goal.target)}</td>
                  <td className="num">{formatMoney(goal.saved)}</td>
                  <td>{goal.deadlineMonths ? `${goal.deadlineMonths} meses` : "Mensal"}</td>
                  <td>
                    <select
                      className="input"
                      style={{ width: "auto", minWidth: "120px" }}
                      value={goal.priority}
                      onChange={(e) => handlePriorityChange(goal.id, e.target.value as Priority)}
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="btn-ghost"
                      style={{ padding: "0.25rem 0.5rem", minHeight: "auto" }}
                      onClick={() => startEdit(goal)}
                    >
                      Editar
                    </button>
                    <button
                      className="btn-ghost"
                      style={{ padding: "0.25rem 0.5rem", minHeight: "auto", color: "var(--error)", borderColor: "var(--error)" }}
                      onClick={() => handleDelete(goal.id)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.goals.length === 0 && !editingId && (
        <div className="card" style={{ textAlign: "center", color: "var(--ink-muted)" }}>
          Nenhuma meta cadastrada. Crie a primeira acima.
        </div>
      )}
    </section>
  );
}