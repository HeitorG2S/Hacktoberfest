import type { Cents, Entry, FinancialState, Goal, GuidanceStep, SpendCheck } from "../contracts/types";
import { monthlyRequest, totalRequested } from "./budget";
import { CATEGORY_SLUGS } from "../contracts/import-format";
import { applyBps, ceilDiv, formatMoney, sum } from "./money";
import { entriesOfMonth, monthSummary } from "./month";
import { formatRateBps } from "./investment";

// Consultas estruturadas que alimentam o RAG. Toda conta é feita aqui; o LLM só recebe o resultado.

// Dias que faltam no mês, contando hoje (todayIso = AAAA-MM-DD).
export function daysLeftInMonth(todayIso: string): number {
  const [y, m, d] = todayIso.split("-").map((x) => Number.parseInt(x, 10)) as [number, number, number];
  const daysInMonth = new Date(y, m, 0).getDate();
  return Math.max(1, daysInMonth - d + 1);
}

// O que as metas ainda pedem no mês, descontando das metas-"caixinha" (meta com o nome de uma categoria, como
// Lazer) o que já foi gasto naquela categoria: esse gasto já saiu do disponível, então não pode contar duas vezes.
export function requestedAfterSpending(state: FinancialState, month: string): Cents {
  return sum(
    state.goals.map((g) => {
      const request = monthlyRequest(g);
      const slug = goalCategory(g);
      return slug ? Math.max(0, request - spentInCategory(state, month, slug).total) : request;
    }),
  );
}

function goalCategory(g: Goal): string | null {
  const key = g.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return (CATEGORY_SLUGS as readonly string[]).includes(g.id) ? g.id : (CATEGORY_SLUGS as readonly string[]).includes(key) ? key : null;
}

// "Posso gastar X hoje sem estourar as metas?"
// Se existe meta da mesma categoria (ex.: Lazer), o gasto sai primeiro dela; o resto sai do dinheiro livre do mês
// (disponível efetivo − o que as metas ainda pedem). Limite do dia = livre / dias restantes.
export function spendCheck(state: FinancialState, amount: Cents, todayIso: string, categorySlug: string | null = null): SpendCheck {
  const month = todayIso.slice(0, 7);
  const effectiveAvailable = monthSummary(state, month).effectiveAvailable;
  const freeMonth = effectiveAvailable - requestedAfterSpending(state, month);
  const daysLeft = daysLeftInMonth(todayIso);
  const dailyFree = freeMonth > 0 ? Math.floor(freeMonth / daysLeft) : 0;
  const b = categorySlug ? categoryBox(state, month, categorySlug) : null;
  const fromBox = b ? Math.min(amount, b.remaining) : 0;
  const rest = amount - fromBox; // parte que sai do dinheiro livre
  let verdict: SpendCheck["verdict"];
  if (rest <= dailyFree) verdict = "cabe_no_dia";
  else if (rest <= freeMonth) verdict = "cabe_no_mes";
  else if (amount <= effectiveAvailable) verdict = "reduz_metas";
  else verdict = "nao_cabe";
  return {
    amount,
    daysLeft,
    freeMonth,
    dailyFree,
    effectiveAvailable,
    verdict,
    overDaily: Math.max(0, rest - dailyFree),
    goalCut: verdict === "reduz_metas" ? rest - Math.max(0, freeMonth) : 0,
    shortfall: verdict === "nao_cabe" ? amount - Math.max(0, effectiveAvailable) : 0,
    box: b ? { goalName: b.goal.name, remaining: b.remaining, fromBox } : null,
  };
}

// Contas fixas planejadas que ainda não apareceram nos lançamentos do mês.
export function fixedPending(state: FinancialState, month: string): Cents {
  return Math.max(0, state.budget.fixed - monthSummary(state, month).spentByBucket.fixed);
}

export function spentInCategory(state: FinancialState, month: string, categorySlug: string): { total: Cents; count: number } {
  const list = entriesOfMonth(state.entries, month).filter((e) => e.type === "despesa" && e.categorySlug === categorySlug);
  return { total: sum(list.map((e) => e.amount)), count: list.length };
}

export function totalOf(entries: Entry[]): Cents {
  return sum(entries.map((e) => (e.type === "despesa" ? e.amount : 0)));
}

export function biggestExpense(state: FinancialState, month: string): Entry | null {
  const list = entriesOfMonth(state.entries, month).filter((e) => e.type === "despesa");
  return list.reduce<Entry | null>((best, e) => (best === null || e.amount > best.amount ? e : best), null);
}

// "Caixinha" de uma categoria: se existe meta com o mesmo nome (ex.: meta Lazer), quanto ela ainda comporta no mês.
export function categoryBox(state: FinancialState, month: string, categorySlug: string, goals: Goal[] = state.goals): { goal: Goal; remaining: Cents; spent: Cents } | null {
  const goal = goals.find((g) => g.id === categorySlug || g.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() === categorySlug);
  if (!goal) return null;
  const spent = spentInCategory(state, month, categorySlug).total;
  return { goal, spent, remaining: Math.max(0, monthlyRequest(goal) - spent) };
}

// ---- Trilha de investimento ----
// Regras fixas (educativas, não personalizadas por analista):
// 1) sem sobra além das metas → não investir agora;
// 2) dívida com juros ≥ 1% a.m. → antecipar a dívida antes de investir;
// 3) reserva de emergência < 3 meses de despesas essenciais → completar a reserva em aplicação de liquidez diária;
// 4) reserva completa → exemplo de divisão 80% renda fixa / 20% renda variável diversificada.
export const RESERVE_MONTHS = 3;
export const EXPENSIVE_DEBT_BPS = 100;
export const FIXED_INCOME_SHARE_BPS = 8000;

export function investmentGuidance(state: FinancialState, month: string): { investable: Cents; steps: GuidanceStep[] } {
  const s = monthSummary(state, month);
  const investable = Math.max(0, s.effectiveAvailable - requestedAfterSpending(state, month));
  const essentials = state.budget.fixed + state.budget.variableEssential + state.budget.debtMinimums;
  const steps: GuidanceStep[] = [];

  if (investable === 0) {
    steps.push({
      id: "sem-sobra",
      title: "Este mês não sobra dinheiro além das metas",
      detail: `O disponível do mês (${formatMoney(s.effectiveAvailable)}) não passa do que as metas ainda pedem (${formatMoney(requestedAfterSpending(state, month))}). Investir agora significaria tirar de uma meta; o primeiro passo é abrir espaço no orçamento.`,
      amount: null,
    });
  }

  const debt = [...state.debts].sort((a, b) => b.monthlyRateBps - a.monthlyRateBps)[0];
  if (debt && debt.balance > 0 && debt.monthlyRateBps >= EXPENSIVE_DEBT_BPS) {
    const interest = applyBps(debt.balance, debt.monthlyRateBps);
    steps.push({
      id: "divida-cara",
      title: `Antes de investir, reduza a dívida "${debt.name}"`,
      detail:
        `Ela cobra ${formatRateBps(debt.monthlyRateBps)} ao mês (${formatMoney(interest)} de juros sobre o saldo de ${formatMoney(debt.balance)} neste mês). ` +
        "Nenhuma aplicação comum rende isso com segurança, então cada real usado para antecipar a dívida \"rende\" esses juros." +
        (debt.minPayment <= interest ? ` O pagamento mínimo (${formatMoney(debt.minPayment)}) nem cobre os juros: pagando só ele, a dívida cresce.` : ""),
      amount: investable > 0 ? investable : null,
    });
  }

  const reserveTarget = essentials * RESERVE_MONTHS;
  if (state.reserveBalance < reserveTarget) {
    const missing = reserveTarget - state.reserveBalance;
    const months = investable > 0 ? ceilDiv(missing, investable) : null;
    steps.push({
      id: "reserva",
      title: "Monte a reserva de emergência",
      detail:
        `A reserva recomendada pela regra do app é de ${RESERVE_MONTHS} meses de despesas essenciais: ${formatMoney(reserveTarget)}. Hoje ela tem ${formatMoney(state.reserveBalance)}; faltam ${formatMoney(missing)}. ` +
        "O lugar indicado é uma aplicação de baixo risco e resgate a qualquer momento, como Tesouro Selic ou CDB com liquidez diária." +
        (months !== null ? ` Guardando ${formatMoney(investable)} por mês, ela fica pronta em ${months} meses.` : ""),
      amount: investable > 0 ? investable : null,
    });
  } else if (investable > 0) {
    const fixedIncome = applyBps(investable, FIXED_INCOME_SHARE_BPS);
    steps.push({
      id: "diversificar",
      title: "Reserva completa: diversifique o que sobra",
      detail:
        `Com a reserva pronta, um exemplo educativo de divisão dos ${formatMoney(investable)} do mês é ${formatMoney(fixedIncome)} em renda fixa (Tesouro, CDB) ` +
        `e ${formatMoney(investable - fixedIncome)} em renda variável diversificada (fundos de índice/ETFs ou FIIs), em vez de concentrar em uma única ação.`,
      amount: investable,
    });
  }

  return { investable, steps };
}

// ---- Séries para os gráficos da Visão geral (todas em centavos, calculadas aqui) ----

// Despesas lançadas no mês por categoria, da maior para a menor.
export function spendingByCategory(state: FinancialState, month: string): { categorySlug: string; total: Cents; count: number }[] {
  const map = new Map<string, { total: Cents; count: number }>();
  for (const e of entriesOfMonth(state.entries, month)) {
    if (e.type !== "despesa") continue;
    const cur = map.get(e.categorySlug) ?? { total: 0, count: 0 };
    map.set(e.categorySlug, { total: cur.total + e.amount, count: cur.count + 1 });
  }
  return [...map].map(([categorySlug, v]) => ({ categorySlug, ...v })).sort((a, b) => b.total - a.total);
}

// Planejado × lançado por grupo do orçamento.
export function plannedVsSpent(state: FinancialState, month: string): { group: "fixed" | "variableEssential" | "debt"; planned: Cents; spent: Cents }[] {
  const s = monthSummary(state, month).spentByBucket;
  return [
    { group: "fixed", planned: state.budget.fixed, spent: s.fixed },
    { group: "variableEssential", planned: state.budget.variableEssential, spent: s.variableEssential },
    { group: "debt", planned: state.budget.debtMinimums, spent: s.debt },
  ];
}

// Disponível efetivo ao fim de cada dia do mês (considera só os lançamentos até aquele dia).
export function dailyAvailableSeries(state: FinancialState, month: string): { day: number; available: Cents }[] {
  const [y, m] = month.split("-").map((x) => Number.parseInt(x, 10)) as [number, number];
  const days = new Date(y, m, 0).getDate();
  const series: { day: number; available: Cents }[] = [];
  for (let d = 1; d <= days; d++) {
    const cutoff = `${month}-${String(d).padStart(2, "0")}`;
    const partial = { ...state, entries: state.entries.filter((e) => e.date <= cutoff) };
    series.push({ day: d, available: monthSummary(partial, month).effectiveAvailable });
  }
  return series;
}

// Totais do mês para os cartões: entradas (renda planejada + receitas extras) e despesas (planejadas + fora do plano).
export function monthTotals(state: FinancialState, month: string): { income: Cents; expenses: Cents; extraIncome: Cents; entriesCount: number } {
  const s = monthSummary(state, month);
  const b = state.budget;
  return {
    income: b.income + s.extraIncome,
    expenses: b.fixed + b.variableEssential + b.debtMinimums + s.overspend + s.spentByBucket.discretionary,
    extraIncome: s.extraIncome,
    entriesCount: s.entriesCount,
  };
}
