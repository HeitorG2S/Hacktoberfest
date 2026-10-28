import { useState, type FormEvent, type ChangeEvent } from "react";
import type { SectionProps } from "../props";
import type { FinancialState, Entry, EntryType, Cents } from "../../contracts/types";
import { CATEGORY_SLUGS, type CategorySlug } from "../../contracts/import-format";
import { currentMonth, today, monthSummary, entriesOfMonth, entryBucket, formatMoney } from "../../engine";
import { emptyEntryForm, validateEntryForm, sortEntries, type EntryForm } from "./form";

const CATEGORY_LABELS: Record<CategorySlug, string> = {
  salario: "Salário",
  moradia: "Moradia",
  contas: "Contas",
  mercado: "Mercado",
  transporte: "Transporte",
  saude: "Saúde",
  educacao: "Educação",
  lazer: "Lazer",
  divida: "Dívida",
  outros: "Outros",
};

function getCategoryOptions(type: EntryType): { value: string; label: string }[] {
  const slugs = CATEGORY_SLUGS.filter((s) => {
    if (type === "receita") return s === "salario";
    return s !== "salario";
  });
  return slugs.map((s) => ({ value: s, label: CATEGORY_LABELS[s] }));
}

function formatDateBR(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function getBucketPlanned(state: FinancialState, bucket: "fixed" | "variableEssential" | "debt"): Cents {
  if (bucket === "fixed") return state.budget.fixed;
  if (bucket === "variableEssential") return state.budget.variableEssential;
  return state.budget.debtMinimums;
}

function getProgressPercent(spent: Cents, planned: Cents): number {
  if (planned === 0) return spent > 0 ? 100 : 0;
  return Math.min(100, Math.round((spent / planned) * 100));
}

export function Lancamentos(props: SectionProps) {
  const { state, onChange } = props;
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonth());
  const [form, setForm] = useState<EntryForm>(() => emptyEntryForm(today()));
  const [errors, setErrors] = useState<Partial<Record<keyof EntryForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const summary = monthSummary(state, selectedMonth);
  const monthEntries = sortEntries(entriesOfMonth(state.entries, selectedMonth));

  function handleFormChange<K extends keyof EntryForm>(field: K, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = validateEntryForm(form, state.entries.map((e) => e.id), () => crypto.randomUUID());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSubmitting(true);
    const newEntries = [...state.entries, result.entry];
    onChange({ ...state, entries: newEntries });
    setForm(emptyEntryForm(today()));
    setErrors({});
    setSubmitting(false);
  }

  function handleDelete(entryId: string) {
    const newEntries = state.entries.filter((e) => e.id !== entryId);
    onChange({ ...state, entries: newEntries });
  }

  function handleMonthChange(e: ChangeEvent<HTMLInputElement>) {
    setSelectedMonth(e.target.value);
  }

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h2>Lançamentos de {selectedMonth}</h2>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "13px" }}>
          Mês:
          <input
            type="month"
            className="input"
            value={selectedMonth}
            onChange={handleMonthChange}
            style={{ width: "auto", minWidth: "160px", marginLeft: "0.5rem" }}
          />
        </label>
      </div>

      <div className="grid" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="kpi-label">Disponível planejado</div>
          <div className="metric num">{formatMoney(summary.plannedAvailable)}</div>
        </div>
        <div className="card">
          <div className="kpi-label">Gasto fora do plano</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span>Lazer/outros: <strong className="num">{formatMoney(summary.spentByBucket.discretionary)}</strong></span>
            <span>Acima do planejado: <strong className="num">{formatMoney(summary.overspend)}</strong></span>
          </div>
        </div>
        <div className="card">
          <div className="kpi-label">Receitas extras</div>
          <div className="metric num">{formatMoney(summary.extraIncome)}</div>
        </div>
        <div className="card">
          <div className="kpi-label">Disponível agora</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
            <div className="metric num">{formatMoney(summary.effectiveAvailable)}</div>
            {summary.effectiveAvailable < 0 && <span className="chip err">NEGATIVO</span>}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: "1.5rem" }}>
        {([
          { bucket: "fixed" as const, label: "Fixas", planned: state.budget.fixed, spent: summary.spentByBucket.fixed },
          { bucket: "variableEssential" as const, label: "Essenciais", planned: state.budget.variableEssential, spent: summary.spentByBucket.variableEssential },
          { bucket: "debt" as const, label: "Dívidas (mín.)", planned: state.budget.debtMinimums, spent: summary.spentByBucket.debt },
        ]).map(({ bucket, label, planned, spent }) => (
          <div key={bucket} className="card" style={{ display: "grid", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
              <span>{label}</span>
              <span className="num">{formatMoney(spent)} / {formatMoney(planned)}</span>
            </div>
            <div className="progress">
              <span style={{ width: `${getProgressPercent(spent, planned)}%` }}></span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
              {planned === 0 && spent > 0 ? "Sem orçamento planejado" : `${getProgressPercent(spent, planned)}% do planejado`}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3>Novo lançamento</h3>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label>
            Data
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(e) => handleFormChange("date", e.target.value)}
            />
            {errors.date && <span style={{ color: "var(--error)", fontSize: "12px" }}>{errors.date}</span>}
          </label>
          <label>
            Descrição
            <input
              type="text"
              className="input"
              maxLength={90}
              value={form.description}
              onChange={(e) => handleFormChange("description", e.target.value)}
              placeholder="Ex: Supermercado"
            />
            {errors.description && <span style={{ color: "var(--error)", fontSize: "12px" }}>{errors.description}</span>}
          </label>
          <label>
            Valor
            <input
              type="text"
              className="input"
              value={form.amount}
              onChange={(e) => handleFormChange("amount", e.target.value)}
              placeholder="Ex: 45,50"
            />
            {errors.amount && <span style={{ color: "var(--error)", fontSize: "12px" }}>{errors.amount}</span>}
          </label>
          <label>
            Tipo
            <select
              className="input"
              value={form.type}
              onChange={(e) => handleFormChange("type", e.target.value as EntryType)}
            >
              <option value="despesa">Despesa</option>
              <option value="receita">Receita extra</option>
            </select>
            {errors.type && <span style={{ color: "var(--error)", fontSize: "12px" }}>{errors.type}</span>}
          </label>
          <label>
            Categoria
            <select
              className="input"
              value={form.categorySlug}
              onChange={(e) => handleFormChange("categorySlug", e.target.value)}
            >
              {getCategoryOptions(form.type).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.categorySlug && <span style={{ color: "var(--error)", fontSize: "12px" }}>{errors.categorySlug}</span>}
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" className="btn" disabled={submitting} style={{ width: "100%" }}>
              {submitting ? "Adicionando..." : "Adicionar"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>Lançamentos do mês ({monthEntries.length})</h3>
        {monthEntries.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            Nenhum lançamento em {selectedMonth}. Registre aqui ou peça ao assistente:
            <code style={{ marginLeft: "0.5rem" }}>'gastei R$ 45 no mercado'</code>
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Origem</th>
                  <th className="num">Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {monthEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateBR(entry.date)}</td>
                    <td>{entry.description}</td>
                    <td>{CATEGORY_LABELS[entry.categorySlug as CategorySlug] || entry.categorySlug}</td>
                    <td>
                      {entry.source === "agente" && <span className="chip">agente</span>}
                    </td>
                    <td className="num">
                      {entry.type === "despesa" ? "−" : "+"}{formatMoney(entry.amount).replace("R$ ", "R$ ")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn-ghost"
                        onClick={() => handleDelete(entry.id)}
                        style={{ padding: "0.25rem 0.5rem", minHeight: "auto", fontSize: "12px" }}
                        aria-label={`Excluir ${entry.description}`}
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
      </div>
    </section>
  );
}