import type { Cents, Entry, FinancialState, MonthSummary } from "../contracts/types";
import { CATEGORY_BUCKET, CATEGORY_SLUGS, type CategorySlug } from "../contracts/import-format";
import { available } from "./budget";
import { assertCents } from "./money";

// Resumo do mês a partir do orçamento planejado e dos lançamentos do dia a dia.
// Regras:
// - despesa de categoria fixa/essencial/dívida consome o que foi planejado para aquele grupo;
//   só o que PASSAR do planejado reduz o disponível (overspend);
// - despesa de categoria sem grupo (lazer, outros, desconhecida) sai direto do disponível (discretionary);
// - receita lançada é renda extra e soma ao disponível.

export function entryBucket(e: Entry): "fixed" | "variableEssential" | "debt" | "discretionary" | "income" {
  const slug = (CATEGORY_SLUGS as readonly string[]).includes(e.categorySlug) ? (e.categorySlug as CategorySlug) : "outros";
  const b = CATEGORY_BUCKET[slug];
  if (b === "income") return "income";
  if (b === "ignorar") return "discretionary";
  return b;
}

export function entriesOfMonth(entries: Entry[], month: string): Entry[] {
  return entries.filter((e) => e.date.startsWith(`${month}-`));
}

export function monthSummary(state: FinancialState, month: string): MonthSummary {
  const spent = { fixed: 0, variableEssential: 0, debt: 0, discretionary: 0 };
  let extraIncome = 0;
  const list = entriesOfMonth(state.entries ?? [], month);
  for (const e of list) {
    assertCents(e.amount, "lançamento");
    if (e.type === "receita") {
      extraIncome += e.amount;
      continue;
    }
    const b = entryBucket(e);
    // Despesa lançada com categoria de renda (ex.: "salario") não faz sentido: trata como discricionária.
    spent[b === "income" ? "discretionary" : b] += e.amount;
  }
  const b = state.budget;
  const overspend =
    Math.max(0, spent.fixed - b.fixed) + Math.max(0, spent.variableEssential - b.variableEssential) + Math.max(0, spent.debt - b.debtMinimums);
  const plannedAvailable = available(b);
  return {
    month,
    plannedAvailable,
    spentByBucket: spent,
    overspend,
    extraIncome,
    effectiveAvailable: assertCents(plannedAvailable + extraIncome - spent.discretionary - overspend, "disponível efetivo"),
    entriesCount: list.length,
  };
}

// Mês atual no fuso local (AAAA-MM). Só a interface chama; o motor recebe o mês como parâmetro.
export function currentMonth(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function today(d: Date = new Date()): string {
  return `${currentMonth(d)}-${String(d.getDate()).padStart(2, "0")}`;
}

