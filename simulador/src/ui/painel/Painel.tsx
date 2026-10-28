import { useState } from "react";
import type { SectionProps } from "../props";
import type { Budget, Goal, FinancialState } from "../../contracts/types";
import { available, monthlyRequest, totalRequested } from "../../engine/budget";
import { formatMoney, toMoneyText, parseMoney, sum, MoneyError } from "../../engine/money";
import { formatRateBps } from "../../engine/investment";

export function Painel(props: SectionProps) {
  const { state, onChange } = props;
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInputs, setBudgetInputs] = useState<Record<keyof Budget, string>>({
    income: toMoneyText(state.budget.income),
    fixed: toMoneyText(state.budget.fixed),
    variableEssential: toMoneyText(state.budget.variableEssential),
    debtMinimums: toMoneyText(state.budget.debtMinimums),
  });
  const [budgetErrors, setBudgetErrors] = useState<Partial<Record<keyof Budget, string>>>({});

  const avail = available(state.budget);
  const totalReq = totalRequested(state.goals);
  const deficit = totalReq - avail;

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
      <div className="grid">
        <div className="card">
          <div className="kpi-label">Renda líquida</div>
          <div className="metric num">{formatMoney(state.budget.income)}</div>
        </div>
        <div className="card">
          <div className="kpi-label">Contas fixas</div>
          <div className="metric num">{formatMoney(state.budget.fixed)}</div>
        </div>
        <div className="card">
          <div className="kpi-label">Essenciais variáveis</div>
          <div className="metric num">{formatMoney(state.budget.variableEssential)}</div>
        </div>
        <div className="card">
          <div className="kpi-label">Mínimo de dívidas</div>
          <div className="metric num">{formatMoney(state.budget.debtMinimums)}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3>Orçamento</h3>
          {editingBudget ? (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn" onClick={handleBudgetSave}>Salvar</button>
              <button className="btn-ghost" onClick={handleBudgetCancel}>Cancelar</button>
            </div>
          ) : (
            <button className="btn-ghost" onClick={() => setEditingBudget(true)}>Editar orçamento</button>
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
      </div>

      <div className="card">
        <h3>Metas do mês</h3>
        {state.goals.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>Nenhuma meta cadastrada. Vá em <strong>Objetivos</strong> para criar.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {state.goals.map((goal) => {
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

      <div className="card-insight">
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <span style={{ fontSize: "20px", lineHeight: 1 }}>✦</span>
          <div>
            <p style={{ margin: 0 }}>
              Suas metas pedem <strong>{formatMoney(totalReq)}</strong> por mês e você tem
              <strong>{formatMoney(avail)}</strong> disponível.
            </p>
            {deficit > 0 && (
              <p style={{ margin: "0.5rem 0 0" }}>
                Faltam <strong>{formatMoney(deficit)}</strong>: veja o <strong>Simulador</strong> para uma divisão que
                cabe no orçamento.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Dívidas</h3>
        {state.debts.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>Nenhuma dívida cadastrada.</p>
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