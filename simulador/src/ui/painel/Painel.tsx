import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import type { Chart as ChartType, ChartData, ChartOptions, TooltipItem } from "chart.js";
import type { SectionProps } from "../props";
import type { Budget, Goal, FinancialState } from "../../contracts/types";
import { monthTotals, spendingByCategory, plannedVsSpent, dailyAvailableSeries, currentMonth, formatMoney, monthSummary, available, monthlyRequest } from "../../engine";
import { toMoneyText, parseMoney } from "../../engine/money";
import { formatRateBps } from "../../engine/investment";
import { CATEGORY_LABEL, GROUP_LABEL } from "./labels";

type Tab = "categorias" | "planejado" | "disponivel";

export function Painel(props: SectionProps) {
  const { state, onChange } = props;
  const mes = currentMonth();
  const totals = monthTotals(state, mes);
  const byCat = spendingByCategory(state, mes);
  const planned = plannedVsSpent(state, mes);
  const daily = dailyAvailableSeries(state, mes);
  const summary = monthSummary(state, mes);

  const [activeTab, setActiveTab] = useState<Tab>("categorias");
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInputs, setBudgetInputs] = useState<Record<keyof Budget, string>>({
    income: toMoneyText(state.budget.income),
    fixed: toMoneyText(state.budget.fixed),
    variableEssential: toMoneyText(state.budget.variableEssential),
    debtMinimums: toMoneyText(state.budget.debtMinimums),
  });
  const [budgetErrors, setBudgetErrors] = useState<Partial<Record<keyof Budget, string>>>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    chartRef.current?.destroy();

    let data: ChartData;
    let options: ChartOptions;

    if (activeTab === "categorias" && byCat.length > 0) {
      data = {
        labels: byCat.map((c) => CATEGORY_LABEL[c.categorySlug] ?? c.categorySlug),
        datasets: [
          {
            label: "Gasto (R$)",
            data: byCat.map((c) => c.total / 100),
            backgroundColor: "#006c49",
            borderRadius: 6,
          },
        ],
      };
      options = {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
plugins: {
           legend: { display: false },
           tooltip: {
             callbacks: {
               label: (ctx: TooltipItem<"bar">) => {
                 const item = byCat[ctx.dataIndex];
                if (!item) return "";
                return `${CATEGORY_LABEL[item.categorySlug] ?? item.categorySlug}: ${formatMoney(item.total)}`;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { callback: (v: number | string) => `R$ ${v}` },
          },
        },
      };
    } else if (activeTab === "planejado" && planned.length > 0) {
      data = {
        labels: planned.map((p) => GROUP_LABEL[p.group] ?? p.group),
        datasets: [
          {
            label: "Planejado",
            data: planned.map((p) => p.planned / 100),
            backgroundColor: "#b9e4cc",
            borderRadius: 6,
          },
          {
            label: "Realizado",
            data: planned.map((p) => p.spent / 100),
            backgroundColor: "#006c49",
            borderRadius: 6,
          },
        ],
      };
      options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx: TooltipItem<"bar">) => {
                const p = planned[ctx.dataIndex];
                if (!p) return "";
                const label = ctx.dataset.label === "Planejado" ? "Planejado" : "Realizado";
                const value = ctx.dataset.label === "Planejado" ? p.planned : p.spent;
                return `${GROUP_LABEL[p.group] ?? p.group} — ${label}: ${formatMoney(value)}`;
              },
            },
          },
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true, ticks: { callback: (v: number | string) => `R$ ${v}` } },
        },
      };
    } else if (activeTab === "disponivel" && daily.length > 0) {
      data = {
        labels: daily.map((d) => `${d.day}`),
        datasets: [
          {
            label: "Disponível (R$)",
            data: daily.map((d) => d.available / 100),
            borderColor: "#006c49",
            backgroundColor: "rgba(0, 108, 73, 0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
        ],
      };
      options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: TooltipItem<"line">) => {
                const item = daily[ctx.dataIndex];
                if (!item) return "";
                return `Dia ${item.day}: ${formatMoney(item.available)}`;
              },
            },
          },
        },
        scales: {
          x: { title: { display: true, text: "Dia do mês" } },
          y: { beginAtZero: true, ticks: { callback: (v: number | string) => `R$ ${v}` } },
        },
        interaction: { intersect: false, mode: "index" as const },
      };
    } else {
      return;
    }

    chartRef.current = new Chart(ctx, { type: activeTab === "disponivel" ? "line" : "bar", data, options });
  }, [activeTab, byCat, planned, daily]);

  function ask(question: string) {
    window.dispatchEvent(new CustomEvent("simfin:ask", { detail: question }));
  }

  const topCat = byCat[0];
  const hasEntries = totals.entriesCount > 0;

  function handleBudgetChange<K extends keyof Budget>(field: K, value: string) {
    setBudgetInputs((prev) => ({ ...prev, [field]: value }));
    if (budgetErrors[field]) setBudgetErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleBudgetSave() {
    const newErrors: Partial<Record<keyof Budget, string>> = {};
    const newBudget: Budget = { income: 0, fixed: 0, variableEssential: 0, debtMinimums: 0 };
    let hasError = false;

    (Object.keys(budgetInputs) as Array<keyof Budget>).forEach((field) => {
      try {
        const cents = parseMoney(budgetInputs[field]);
        if (cents < 0) {
          newErrors[field] = "Valor não pode ser negativo";
          hasError = true;
        } else {
          newBudget[field] = cents;
        }
      } catch {
        newErrors[field] = "Valor inválido";
        hasError = true;
      }
    });

    if (hasError) {
      setBudgetErrors(newErrors);
      return;
    }

    onChange({ ...state, budget: newBudget });
    setEditingBudget(false);
  }

  function handleBudgetCancel() {
    setBudgetInputs({
      income: toMoneyText(state.budget.income),
      fixed: toMoneyText(state.budget.fixed),
      variableEssential: toMoneyText(state.budget.variableEssential),
      debtMinimums: toMoneyText(state.budget.debtMinimums),
    });
    setBudgetErrors({});
    setEditingBudget(false);
  }

  return (
    <section>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-head">
            <span className="kpi-icon blue">↗</span>
            <span>Entradas</span>
          </div>
          <div className="kpi-value">{formatMoney(totals.income)}</div>
          <div className="kpi-foot green">
            {totals.extraIncome > 0
              ? `inclui ${formatMoney(totals.extraIncome)} de receitas extras`
              : "renda do orçamento"}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-head">
            <span className="kpi-icon orange">↘</span>
            <span>Despesas</span>
          </div>
          <div className="kpi-value">{formatMoney(totals.expenses)}</div>
          <div className="kpi-foot">{totals.entriesCount} lançamento{hasEntries && totals.entriesCount !== 1 ? "s" : ""} no mês</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-head">
            <span className="kpi-icon blue">▤</span>
            <span>Maior categoria</span>
          </div>
          <div className="kpi-value small">{topCat ? CATEGORY_LABEL[topCat.categorySlug] ?? topCat.categorySlug : "—"}</div>
          <div className="kpi-foot">
            {topCat ? `${formatMoney(topCat.total)} neste mês` : "registre gastos em Lançamentos"}
          </div>
        </div>
      </div>

      <div className="insight-card">
        <span className="insight-mark">●</span>
        <div className="insight-copy">
          <label>LEITURA DO MÊS</label>
          <p>
            {topCat
              ? `${CATEGORY_LABEL[topCat.categorySlug] ?? topCat.categorySlug} é onde mais saiu dinheiro neste mês: ${formatMoney(topCat.total)} em ${topCat.count} lançamento${topCat.count !== 1 ? "s" : ""}.`
              : "Ainda não há lançamentos neste mês."}
          </p>
          <small>Resumo calculado no seu navegador a partir dos lançamentos.</small>
        </div>
        <button className="btn-ghost" onClick={() => ask(topCat ? `Quanto gastei com ${CATEGORY_LABEL[topCat.categorySlug] ?? topCat.categorySlug} este mês?` : "Quanto tenho?")}>
          Perguntar ao assistente →
        </button>
      </div>

      <div className="section-card">
        <div className="section-head">
          <span className="section-eyebrow">ANÁLISE VISUAL</span>
          <h2>Entenda o movimento do seu dinheiro</h2>
        </div>
        <p style={{ color: "var(--ink-muted)", marginBottom: "1rem" }}>Calculado com o orçamento e os lançamentos deste navegador.</p>

        <div className="seg" role="tablist" aria-label="Tipo de análise">
          <button role="tab" className={activeTab === "categorias" ? "active" : ""} onClick={() => setActiveTab("categorias")} aria-selected={activeTab === "categorias"}>
            Categorias
          </button>
          <button role="tab" className={activeTab === "planejado" ? "active" : ""} onClick={() => setActiveTab("planejado")} aria-selected={activeTab === "planejado"}>
            Planejado × realizado
          </button>
          <button role="tab" className={activeTab === "disponivel" ? "active" : ""} onClick={() => setActiveTab("disponivel")} aria-selected={activeTab === "disponivel"}>
            Disponível no mês
          </button>
        </div>

        <div className="analysis-grid">
          <div className="card">
            <div className="chart-box">
              {((activeTab === "categorias" && byCat.length === 0) ||
                (activeTab === "planejado" && planned.length === 0) ||
                (activeTab === "disponivel" && daily.length === 0)) ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--ink-muted)" }}>
                  Sem dados para exibir
                </div>
              ) : (
                <canvas ref={canvasRef} aria-label={`Gráfico de ${activeTab === "categorias" ? "gastos por categoria" : activeTab === "planejado" ? "planejado versus realizado" : "disponível diário"}`} />
              )}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>PERGUNTAS PARA EXPLORAR</h3>
            <ul className="explore-list">
              <li className="explore-item" onClick={() => ask("Qual minha maior despesa?")}>
                <i>🔍</i>
                <span><b>Maior despesa</b><small>Qual categoria pesa mais no orçamento?</small></span>
              </li>
              <li className="explore-item" onClick={() => ask("Quanto gastei com delivery este mês?")}>
                <i>🛵</i>
                <span><b>Delivery</b><small>Filtre gastos de delivery e apps de comida.</small></span>
              </li>
              <li className="explore-item" onClick={() => ask("Consigo gastar R$ 50 hoje sem estourar minhas metas?")}>
                <i>💸</i>
                <span><b>Posso gastar hoje?</b><small>Veja sua margem diária disponível.</small></span>
              </li>
              <li className="explore-item" onClick={() => ask("Onde invisto o que sobra no mês?")}>
                <i>📈</i>
                <span><b>Onde investir</b><small>Sugestões para o excedente do mês.</small></span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="section-card">
        <div className="section-head">
          <h2>Orçamento</h2>
          {editingBudget ? (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn" onClick={handleBudgetSave}>Salvar</button>
              <button className="btn-ghost" onClick={handleBudgetCancel}>Cancelar</button>
            </div>
          ) : (
            <button className="btn-ghost" onClick={() => setEditingBudget(true)}>Editar</button>
          )}
        </div>

        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label>
            Renda líquida
            <input
              className="input"
              type="text"
              value={budgetInputs.income}
              onChange={(e) => handleBudgetChange("income", e.target.value)}
              disabled={!editingBudget}
            />
            {budgetErrors.income && <span style={{ color: "var(--error)", fontSize: "12px" }}>{budgetErrors.income}</span>}
          </label>
          <label>
            Contas fixas
            <input
              className="input"
              type="text"
              value={budgetInputs.fixed}
              onChange={(e) => handleBudgetChange("fixed", e.target.value)}
              disabled={!editingBudget}
            />
            {budgetErrors.fixed && <span style={{ color: "var(--error)", fontSize: "12px" }}>{budgetErrors.fixed}</span>}
          </label>
          <label>
            Essenciais variáveis
            <input
              className="input"
              type="text"
              value={budgetInputs.variableEssential}
              onChange={(e) => handleBudgetChange("variableEssential", e.target.value)}
              disabled={!editingBudget}
            />
            {budgetErrors.variableEssential && (
              <span style={{ color: "var(--error)", fontSize: "12px" }}>{budgetErrors.variableEssential}</span>
            )}
          </label>
          <label>
            Mínimo de dívidas
            <input
              className="input"
              type="text"
              value={budgetInputs.debtMinimums}
              onChange={(e) => handleBudgetChange("debtMinimums", e.target.value)}
              disabled={!editingBudget}
            />
            {budgetErrors.debtMinimums && (
              <span style={{ color: "var(--error)", fontSize: "12px" }}>{budgetErrors.debtMinimums}</span>
            )}
          </label>
        </div>
        <p className="muted" style={{ marginTop: "0.5rem", fontSize: "13px" }}>
          Disponível para metas: <span className="num">{formatMoney(available(state.budget))}</span>
        </p>
      </div>

      <div className="section-card">
        <div className="section-head">
          <h2>Metas do mês</h2>
        </div>
        {state.goals.length === 0 ? (
          <p className="muted">Nenhuma meta cadastrada. Vá em <strong>Objetivos</strong> para criar.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {state.goals.map((goal: Goal) => {
              const req = monthlyRequest(goal);
              const pct = goal.target > 0 ? Math.min(100, Math.round((goal.saved / goal.target) * 100)) : 0;
              return (
                <div key={goal.id} style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "1fr auto auto" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontWeight: 600 }}>{goal.name}</span>
                      <span className={goal.priority === "alta" ? "chip" : goal.priority === "media" ? "chip warn" : "chip err"}>
                        {goal.priority}
                      </span>
                    </div>
                    <div className="progress" style={{ marginTop: "0.25rem" }}>
                      <span style={{ width: `${pct}%` }}></span>
                    </div>
                  </div>
                  <div className="num" style={{ alignSelf: "center" }}>{formatMoney(req)}/mês</div>
                  <div className="num muted" style={{ alignSelf: "center", fontSize: "13px" }}>
                    {formatMoney(goal.saved)} / {formatMoney(goal.target)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="section-card">
        <div className="section-head">
          <h2>Dívidas</h2>
        </div>
        {state.debts.length === 0 ? (
          <p className="muted">Nenhuma dívida cadastrada.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Dívida</th>
                <th className="num">Saldo</th>
                <th className="num">Mínimo</th>
                <th className="num">Juros a.m.</th>
              </tr>
            </thead>
            <tbody>
              {state.debts.map((debt) => (
                <tr key={debt.id}>
                  <td>{debt.name}</td>
                  <td className="num">{formatMoney(debt.balance)}</td>
                  <td className="num">{formatMoney(debt.minPayment)}</td>
                  <td className="num">
                    {formatRateBps(debt.monthlyRateBps)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}