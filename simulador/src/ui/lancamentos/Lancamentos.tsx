import { useState, type FormEvent, type ChangeEvent } from "react";
import type { SectionProps } from "../props";
import type { FinancialState, Entry, EntryType, Cents } from "../../contracts/types";
import { CATEGORY_SLUGS, type CategorySlug } from "../../contracts/import-format";
import { currentMonth, today, monthSummary, entriesOfMonth, entryBucket, formatMoney, toMoneyText } from "../../engine";
import { emptyEntryForm, validateEntryForm, sortEntries, type EntryForm } from "./form";
import { entriesToCsv, downloadCsv, formatShortDate } from "./csv";

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

function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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
  const [searchQuery, setSearchQuery] = useState("");

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
    setSearchQuery("");
  }

  function handleExportCsv() {
    downloadCsv(monthEntries, `lancamentos-${selectedMonth}.csv`);
  }

  const filteredEntries = monthEntries.filter((entry) => {
    if (!searchQuery.trim()) return true;
    const normalizedQuery = normalizeForSearch(searchQuery);
    const searchableText = normalizeForSearch(
      `${entry.description} ${CATEGORY_LABELS[entry.categorySlug as CategorySlug] || entry.categorySlug}`
    );
    return searchableText.includes(normalizedQuery);
  });

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
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

      <section className="section-card" aria-labelledby="entriesTitle">
        <div className="section-head" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <span className="section-eyebrow">SEU DIA A DIA</span>
            <h2 id="entriesTitle">Últimos lançamentos</h2>
            <p>Consulte e organize seus movimentos.</p>
          </div>
          <div className="table-tools" style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
            <label className="search" style={{ display: "flex", alignItems: "center", gap: "5px", width: "200px", height: "36px", padding: "0 10px", border: "1px solid var(--border-input)", borderRadius: "8px", background: "#fff" }}>
              <span style={{ color: "var(--ink-muted)" }}>⌕</span>
              <input
                type="search"
                className="input"
                placeholder="Buscar lançamento"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 0, outline: 0, background: "transparent", width: "100%", minWidth: 0, fontSize: "13px", padding: 0 }}
              />
            </label>
            <button className="btn quiet" type="button" onClick={handleExportCsv} style={{ minHeight: "36px", padding: "0 12px", fontSize: "13px" }}>
              ↓ Exportar CSV
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fbfcfb" }}>
                <th style={{ height: "32px", padding: "0 9px", borderTop: "1px solid #f0f2f0", borderBottom: "1px solid #edf0ed", color: "var(--ink-muted)", fontSize: "11px", fontWeight: "650", textTransform: "uppercase", letterSpacing: "0.03em" }}>Descrição</th>
                <th style={{ height: "32px", padding: "0 9px", borderTop: "1px solid #f0f2f0", borderBottom: "1px solid #edf0ed", color: "var(--ink-muted)", fontSize: "11px", fontWeight: "650", textTransform: "uppercase", letterSpacing: "0.03em" }}>Categoria</th>
                <th style={{ height: "32px", padding: "0 9px", borderTop: "1px solid #f0f2f0", borderBottom: "1px solid #edf0ed", color: "var(--ink-muted)", fontSize: "11px", fontWeight: "650", textTransform: "uppercase", letterSpacing: "0.03em" }}>Data</th>
                <th style={{ height: "32px", padding: "0 9px", borderTop: "1px solid #f0f2f0", borderBottom: "1px solid #edf0ed", color: "var(--ink-muted)", fontSize: "11px", fontWeight: "650", textTransform: "uppercase", letterSpacing: "0.03em" }}>Origem</th>
                <th style={{ height: "32px", padding: "0 9px", borderTop: "1px solid #f0f2f0", borderBottom: "1px solid #edf0ed", color: "var(--ink-muted)", fontSize: "11px", fontWeight: "650", textTransform: "uppercase", letterSpacing: "0.03em", textAlign: "right" }}>Valor</th>
                <th style={{ height: "32px", padding: "0 9px", borderTop: "1px solid #f0f2f0", borderBottom: "1px solid #edf0ed", color: "var(--ink-muted)", fontSize: "11px", fontWeight: "650", textTransform: "uppercase", letterSpacing: "0.03em" }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "var(--ink-muted)" }}>
                    {monthEntries.length === 0
                      ? `Nenhum lançamento em ${selectedMonth}. Registre aqui ou peça ao assistente: <code style={{ marginLeft: "0.5rem" }}>'gastei R$ 45 no mercado'</code>`
                      : "Nenhum lançamento encontrado para a busca."}
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: "1px solid #f0f2f0" }}>
                    <td style={{ height: "49px", padding: "0 9px", fontSize: "13px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                          <span className={entry.type === "despesa" ? "entry-icon" : "entry-icon in"} style={{ display: "inline-grid", placeItems: "center", width: "26px", height: "26px", borderRadius: "8px", fontStyle: "normal", fontSize: "13px", background: entry.type === "despesa" ? "#fee8e5" : "#d1fae5", color: entry.type === "despesa" ? "#bb554d" : "#006c49" }}>
                            {entry.type === "despesa" ? "↘" : "↗"}
                          </span>
                          <div>
                            <b style={{ display: "block", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "13px", color: "var(--ink)" }}>{entry.description}</b>
                            <span className="muted" style={{ display: "block", fontSize: "11px" }}>{entry.type === "despesa" ? "Despesa" : "Receita"}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ height: "49px", padding: "0 9px", fontSize: "12px" }}>
                      <span className="pill" style={{ display: "inline-block", padding: "3px 9px", borderRadius: "12px", background: "#f0f7f1", color: "#66806e", whiteSpace: "nowrap" }}>
                        {CATEGORY_LABELS[entry.categorySlug as CategorySlug] || entry.categorySlug}
                      </span>
                    </td>
                    <td style={{ height: "49px", padding: "0 9px", fontSize: "12px", color: "var(--ink-muted)" }}>
                      {formatShortDate(entry.date)}
                    </td>
                    <td style={{ height: "49px", padding: "0 9px" }}>
                      {entry.source === "agente" && (
                        <span className="chip" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 9px", borderRadius: "999px", fontWeight: "700", fontSize: "10px", letterSpacing: "0.04em", textTransform: "uppercase", background: "var(--tertiary)", color: "var(--secondary)", whiteSpace: "nowrap" }}>
                          agente
                        </span>
                      )}
                    </td>
                    <td className="num" style={{ height: "49px", padding: "0 9px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: "650", color: entry.type === "despesa" ? "#bb554d" : "#006c49" }}>
                      {entry.type === "despesa" ? "−" : "+"}{formatMoney(entry.amount).replace("R$ ", "R$ ")}
                    </td>
                    <td style={{ height: "49px", padding: "0 9px", textAlign: "right" }}>
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
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="table-foot" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", borderTop: "1px solid #edf0ed", color: "var(--ink-muted)", fontSize: "12px" }}>
          <span>{filteredEntries.length} exibido{filteredEntries.length !== 1 ? "s" : ""} · {monthEntries.length} no mês</span>
        </div>
      </section>
    </section>
  );
}