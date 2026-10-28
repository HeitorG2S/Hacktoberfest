import type {
  Cents,
  Consequence,
  Debt,
  FinancialState,
  Goal,
  Intent,
  Plan,
  PlanEvaluation,
  SimulationResult,
} from "../contracts/types";
import { available, totalRequested } from "./budget";
import { monthSummary } from "./month";
import { applyBps, ceilDiv, formatMoney, sum } from "./money";
import { conservativePlan, optimize } from "./optimizer";
import { evaluatePlan } from "./validate";

// Motor de simulação: recebe o estado e a intenção já validada e devolve planos verificados,
// consequências e explicação. Não conhece o LLM, a interface nem o formato de importação.

const SYNONYMS: Record<string, string[]> = {
  reserva: ["reserva", "emergencia", "emergencias", "imprevisto", "imprevistos"],
  computador: ["computador", "notebook", "pc", "laptop"],
  lazer: ["lazer", "diversao", "passeio", "passeios"],
};

export function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Associa um nome citado (pelo usuário ou pelo LLM) a uma meta cadastrada.
export function matchGoal(goals: Goal[], name: string): Goal | undefined {
  const n = normalizeName(name);
  if (!n) return undefined;
  const direct = goals.find((g) => {
    const gid = normalizeName(g.id);
    const gname = normalizeName(g.name);
    return gid === n || gname === n || gname.includes(n) || n.includes(gid);
  });
  if (direct) return direct;
  for (const words of Object.values(SYNONYMS)) {
    if (!words.some((w) => n.includes(w))) continue;
    const g = goals.find((x) => words.some((w) => normalizeName(x.name).includes(w) || normalizeName(x.id).includes(w)));
    if (g) return g;
  }
  return undefined;
}

function slug(s: string): string {
  return normalizeName(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "meta";
}

// Aplica à lista de metas o que o usuário pediu: novo valor/prazo/prioridade, ou meta nova (só se tiver valor).
// Em compra/despesa/renda/dívida, o objeto citado não é meta: só ajusta metas existentes.
const NO_NEW_GOALS = new Set(["compra", "despesa_inesperada", "perda_renda", "divida_vs_reserva"]);

export function applyIntentGoals(goals: Goal[], intent: Intent): { goals: Goal[]; notes: string[] } {
  const out = goals.map((g) => ({ ...g }));
  const notes: string[] = [];
  for (const ig of intent.goals) {
    const existing = matchGoal(out, ig.name);
    if (existing) {
      if (ig.amount !== null) existing.target = ig.amount;
      if (ig.deadlineMonths !== null) existing.deadlineMonths = ig.deadlineMonths;
      if (ig.priority !== null) existing.priority = ig.priority;
      if (ig.amount !== null || ig.deadlineMonths !== null)
        notes.push(`Meta "${existing.name}" ajustada para ${formatMoney(existing.target)}${existing.deadlineMonths ? ` em ${existing.deadlineMonths} meses` : " por mês"}.`);
    } else if (NO_NEW_GOALS.has(intent.scenario)) {
      continue;
    } else if (ig.amount !== null) {
      let id = slug(ig.name);
      while (out.some((g) => g.id === id)) id += "-2";
      out.push({ id, name: ig.name, target: ig.amount, saved: 0, deadlineMonths: ig.deadlineMonths, priority: ig.priority ?? "media" });
      notes.push(`Meta nova considerada na simulação: "${ig.name}" (${formatMoney(ig.amount)}${ig.deadlineMonths ? ` em ${ig.deadlineMonths} meses` : ""}).`);
    } else {
      notes.push(`"${ig.name}" não corresponde a nenhuma meta cadastrada e não tem valor; foi ignorada.`);
    }
  }
  return { goals: out, notes };
}

// Converte a divisão proposta pelo LLM (por nome) em plano por id; nomes sem correspondência viram META_DESCONHECIDA.
export function gemmaPlan(goals: Goal[], intent: Intent): Plan | null {
  if (intent.proposedAllocation.length === 0) return null;
  return {
    label: "gemma",
    allocations: intent.proposedAllocation.map((p) => ({ goalId: matchGoal(goals, p.goal)?.id ?? p.goal, amount: p.amount })),
  };
}

function plansFor(goals: Goal[], avail: Cents, intent: Intent): PlanEvaluation[] {
  const budgetForPlans = Math.max(0, avail);
  const plans: PlanEvaluation[] = [];
  const g = gemmaPlan(goals, intent);
  // Com disponível negativo, o teto dos planos é zero: o déficit é tratado nas consequências, não nos planos.
  if (g) plans.push(evaluatePlan(goals, budgetForPlans, g));
  plans.push(evaluatePlan(goals, budgetForPlans, optimize(goals, budgetForPlans)));
  plans.push(evaluatePlan(goals, budgetForPlans, conservativePlan(goals, budgetForPlans)));
  return plans;
}

// ---- dívida × reserva ----

export interface DebtProjection {
  months: number | null; // null = não quita no horizonte (ex.: pagamento não cobre os juros)
  coversInterest: boolean; // o pagamento do 1º mês é maior que os juros do 1º mês?
  interestPaid: Cents;
  balanceAt: (month: number) => Cents; // saldo após o pagamento do mês
  interestUntil: (month: number) => Cents; // juros acumulados até o mês
}

export function projectDebt(debt: Debt, monthlyPayment: Cents, maxMonths = 600): DebtProjection {
  let balance = debt.balance;
  let interestPaid = 0;
  const history: Cents[] = [balance];
  const interestHistory: Cents[] = [0];
  let months: number | null = null;
  const coversInterest = monthlyPayment > applyBps(debt.balance, debt.monthlyRateBps);
  for (let m = 1; m <= maxMonths && balance <= 1e12; m++) {
    const interest = applyBps(balance, debt.monthlyRateBps);
    balance += interest;
    interestPaid += interest;
    balance -= Math.min(balance, monthlyPayment);
    history.push(balance);
    interestHistory.push(interestPaid);
    if (balance === 0) {
      months = m;
      break;
    }
  }
  const at = (arr: Cents[], m: number) => arr[Math.min(m, arr.length - 1)]!;
  return { months, coversInterest, interestPaid, balanceAt: (m) => at(history, m), interestUntil: (m) => at(interestHistory, m) };
}

// ---- simulação ----

// opts.month (AAAA-MM): considera os lançamentos do mês (gastos fora do plano e receitas extras).
export function simulate(state: FinancialState, intent: Intent, opts: { month?: string } = {}): SimulationResult {
  const summary = opts.month ? monthSummary(state, opts.month) : null;
  const baseAvail = summary ? summary.effectiveAvailable : available(state.budget);
  const { goals, notes } = applyIntentGoals(state.goals, intent);
  const requested = totalRequested(goals);
  const consequences: Consequence[] = [];
  const explanation: string[] = [...notes];
  let avail = baseAvail;
  if (summary && summary.entriesCount > 0 && summary.effectiveAvailable !== summary.plannedAvailable) {
    consequences.push({ label: "Disponível planejado → após os lançamentos do mês", before: summary.plannedAvailable, after: summary.effectiveAvailable });
    explanation.push(
      `Considerei os ${summary.entriesCount} lançamentos de ${summary.month}: o disponível passou de ${formatMoney(summary.plannedAvailable)} para ${formatMoney(summary.effectiveAvailable)}.`,
    );
  }

  switch (intent.scenario) {
    case "compra": {
      const price = intent.amount ?? 0;
      avail = baseAvail - price;
      consequences.push({ label: "Disponível no mês após a compra", before: baseAvail, after: avail });
      if (price === 0) explanation.push("Não identifiquei o valor da compra; informe quanto custa.");
      else if (avail >= 0) explanation.push(`A compra de ${formatMoney(price)} cabe no mês: sobram ${formatMoney(avail)} para as metas.`);
      else {
        const months = baseAvail > 0 ? ceilDiv(price, baseAvail) : null;
        explanation.push(
          `A compra de ${formatMoney(price)} não cabe neste mês: faltam ${formatMoney(-avail)}.` +
            (months ? ` Guardando todo o disponível (${formatMoney(baseAvail)}/mês), leva ${months} meses.` : ""),
        );
        if (state.reserveBalance > 0)
          consequences.push({ label: "Reserva se usada para cobrir a diferença", before: state.reserveBalance, after: state.reserveBalance + avail });
      }
      break;
    }
    case "despesa_inesperada": {
      const cost = intent.amount ?? 0;
      avail = baseAvail - cost;
      consequences.push({ label: "Disponível para metas após a despesa", before: baseAvail, after: Math.max(0, avail) });
      if (avail >= 0) {
        // De onde sai o dinheiro: comparação do plano otimizado antes e depois da despesa, meta a meta.
        const before = optimize(goals, baseAvail).allocations;
        const after = optimize(goals, avail).allocations;
        explanation.push(`A despesa de ${formatMoney(cost)} cabe no disponível do mês, retirando das metas deste mês conforme a prioridade (a reserva acumulada não é tocada).`);
        for (const g of goals) {
          const b0 = before.find((x) => x.goalId === g.id)?.amount ?? 0;
          const a0 = after.find((x) => x.goalId === g.id)?.amount ?? 0;
          if (b0 !== a0) consequences.push({ label: `Retirado da meta "${g.name}"`, before: b0, after: a0 });
        }
      } else {
        const fromReserve = Math.min(state.reserveBalance, -avail);
        const uncovered = -avail - fromReserve;
        explanation.push(`O disponível do mês (${formatMoney(baseAvail)}) não cobre a despesa de ${formatMoney(cost)}; todas as metas do mês ficam suspensas.`);
        consequences.push({ label: "Retirado da reserva de emergência", before: state.reserveBalance, after: state.reserveBalance - fromReserve });
        if (uncovered > 0) {
          explanation.push(`Mesmo usando a reserva, faltam ${formatMoney(uncovered)}: seria preciso cortar despesas variáveis ou negociar prazos.`);
          consequences.push({ label: "Valor sem cobertura", before: null, after: -uncovered });
        }
      }
      break;
    }
    case "perda_renda": {
      const pct = intent.incomeChangePct ?? 0;
      const incomeDelta = applyBps(state.budget.income, pct * 100);
      const newIncome = state.budget.income + incomeDelta;
      // Parte do disponível já ajustado pelos lançamentos do mês (baseAvail), não do planejado.
      avail = baseAvail + incomeDelta;
      consequences.push({ label: "Renda líquida", before: state.budget.income, after: newIncome });
      consequences.push({ label: "Disponível no mês", before: baseAvail, after: avail });
      if (avail < 0)
        explanation.push(`Com ${pct}% na renda, as despesas obrigatórias passam a renda em ${formatMoney(-avail)}: não sobra nada para metas e o déficit precisa ser coberto pela reserva (${formatMoney(state.reserveBalance)}) ou por cortes.`);
      else explanation.push(`Com ${pct}% na renda, o disponível cai de ${formatMoney(baseAvail)} para ${formatMoney(avail)}.`);
      break;
    }
    case "divida_vs_reserva": {
      const debt = [...state.debts].sort((a, b) => b.monthlyRateBps - a.monthlyRateBps)[0];
      if (!debt) {
        explanation.push("Não há dívidas cadastradas; todo o disponível pode ir para a reserva e as metas.");
        break;
      }
      const extra = Math.max(0, intent.amount ?? baseAvail);
      const accelerate = projectDebt(debt, debt.minPayment + extra);
      const horizon = accelerate.months ?? 12;
      const minimum = projectDebt(debt, debt.minPayment, horizon);
      const essentials = sum([state.budget.fixed, state.budget.variableEssential, state.budget.debtMinimums]);
      consequences.push({ label: `Acelerar "${debt.name}": meses até quitar`, before: null, after: null, note: accelerate.months === null ? "não quita" : `${accelerate.months} meses` });
      consequences.push({ label: "Juros pagos acelerando", before: null, after: accelerate.interestPaid });
      consequences.push({ label: `Só o mínimo: saldo da dívida em ${horizon} meses`, before: debt.balance, after: minimum.balanceAt(horizon) });
      consequences.push({ label: `Só o mínimo: reserva acumulada em ${horizon} meses`, before: state.reserveBalance, after: state.reserveBalance + extra * horizon });
      const interestMin = minimum.interestUntil(horizon);
      if (!minimum.coversInterest)
        explanation.push(`Atenção: o pagamento mínimo de "${debt.name}" (${formatMoney(debt.minPayment)}) não cobre os juros do mês (${formatMoney(applyBps(debt.balance, debt.monthlyRateBps))}). Pagando só o mínimo, a dívida cresce.`);
      if (!accelerate.coversInterest)
        explanation.push(`Mesmo somando ${formatMoney(extra)} por mês, o pagamento não cobre os juros: é preciso renegociar a dívida.`);
      consequences.push({ label: `Só o mínimo: juros pagos em ${horizon} meses`, before: null, after: interestMin });
      // Regra fixa do sistema (transparente): primeiro 1 mês de despesas essenciais na reserva; depois, dívida cara.
      if (state.reserveBalance < essentials)
        explanation.push(`Regra do simulador: sua reserva (${formatMoney(state.reserveBalance)}) é menor que 1 mês de despesas essenciais (${formatMoney(essentials)}). Monte essa reserva primeiro e depois acelere a dívida; sem reserva, um imprevisto vira dívida nova.`);
      else
        explanation.push(`Regra do simulador: a reserva já cobre 1 mês de despesas essenciais; com juros de ${debt.monthlyRateBps / 100}% a.m., acelerar "${debt.name}" economiza ${formatMoney(Math.max(0, interestMin - accelerate.interestPaid))} em juros no período.`);
      break;
    }
    default:
      if (intent.scenario === "desconhecido") explanation.push("Não consegui identificar o tipo de decisão; mostro a divisão do disponível atual entre as metas.");
  }

  const plans = plansFor(goals, avail, intent);
  const feasible = avail >= requested;
  explanation.push(...explainPlans(goals, Math.max(0, avail), requested, plans));
  return { scenario: intent.scenario, available: avail, feasible, plans, consequences, explanation };
}

export function explainPlans(goals: Goal[], avail: Cents, requested: Cents, plans: PlanEvaluation[]): string[] {
  const lines: string[] = [];
  const name = (id: string) => goals.find((g) => g.id === id)?.name ?? id;
  if (requested <= avail) {
    lines.push(`As metas pedem ${formatMoney(requested)} e o disponível é ${formatMoney(avail)}: todas cabem${avail > requested ? ` e sobram ${formatMoney(avail - requested)}` : ""}.`);
  } else {
    lines.push(`As metas pedem ${formatMoney(requested)}, mas o disponível é ${formatMoney(avail)}: faltam ${formatMoney(requested - avail)}. Não é possível atender todas integralmente.`);
  }
  const opt = plans.find((p) => p.plan.label === "otimizado");
  if (opt && requested > avail) {
    for (const o of opt.perGoal) {
      if (o.status === "atendida") lines.push(`${name(o.goalId)}: atendida (${formatMoney(o.allocated)}).`);
      else if (o.status === "reduzida") lines.push(`${name(o.goalId)}: reduzida de ${formatMoney(o.requested)} para ${formatMoney(o.allocated)}.`);
      else if (o.requested > 0) lines.push(`${name(o.goalId)}: sem verba neste mês (pedia ${formatMoney(o.requested)}).`);
    }
    lines.push("O plano otimizado prioriza as metas de maior prioridade, mas distribui o restante para que nenhuma meta fique desproporcionalmente sem verba.");
  }
  for (const o of opt?.perGoal ?? []) {
    const g = goals.find((x) => x.id === o.goalId);
    if (g?.deadlineMonths && o.allocated < o.requested) {
      const remaining = Math.max(0, g.target - g.saved);
      const months = o.allocated > 0 ? ceilDiv(remaining, o.allocated) : null;
      lines.push(`${g.name}: no ritmo de ${formatMoney(o.allocated)}/mês, ${months ? `leva ${months} meses em vez de ${g.deadlineMonths}` : "a meta não avança"}.`);
    }
  }
  const gem = plans.find((p) => p.plan.label === "gemma");
  if (gem) {
    lines.push(
      gem.valid
        ? `O plano sugerido pelo Gemma é válido (soma ${formatMoney(gem.total)}).`
        : `O plano sugerido pelo Gemma foi rejeitado pela verificação: ${gem.violations.map((v) => v.detail).join("; ")}.`,
    );
  }
  return lines;
}


