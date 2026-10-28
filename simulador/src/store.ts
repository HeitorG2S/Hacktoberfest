import { useEffect, useState } from "react";
import type { FinancialState } from "./contracts/types";

// Estado do app no localStorage do navegador (nenhum servidor, nenhum log).
// O app começa VAZIO: o usuário informa o próprio orçamento ou importa um extrato.
const KEY = "simfin:state:v2";

export const EMPTY_STATE: FinancialState = {
  budget: { income: 0, fixed: 0, variableEssential: 0, debtMinimums: 0 },
  goals: [],
  debts: [],
  reserveBalance: 0,
  entries: [],
};

const isCents = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

// Completa campos que versões antigas do estado não tinham e descarta o que estiver corrompido
// (um localStorage inválido não pode derrubar o app inteiro).
export function normalizeState(raw: Partial<FinancialState> | null | undefined): FinancialState {
  if (!isObj(raw) || !isObj(raw.budget)) return EMPTY_STATE;
  const b = raw.budget as unknown as Record<string, unknown>;
  if (![b.income, b.fixed, b.variableEssential, b.debtMinimums].every(isCents)) return EMPTY_STATE;
  const goals = (Array.isArray(raw.goals) ? raw.goals : []).filter(
    (g) => isObj(g) && typeof g.id === "string" && typeof g.name === "string" && isCents(g.target) && isCents(g.saved),
  );
  const debts = (Array.isArray(raw.debts) ? raw.debts : []).filter(
    (d) => isObj(d) && typeof d.id === "string" && isCents(d.balance) && isCents(d.minPayment) && Number.isSafeInteger(d.monthlyRateBps),
  );
  const entries = (Array.isArray(raw.entries) ? raw.entries : []).filter(
    (e) => isObj(e) && typeof e.id === "string" && typeof e.date === "string" && isCents(e.amount) && e.amount > 0 && (e.type === "despesa" || e.type === "receita"),
  );
  const investment =
    isObj(raw.investment) && Number.isSafeInteger(raw.investment.annualRateBps) && typeof raw.investment.label === "string" ? raw.investment : undefined;
  return {
    budget: { income: b.income as number, fixed: b.fixed as number, variableEssential: b.variableEssential as number, debtMinimums: b.debtMinimums as number },
    goals,
    debts,
    reserveBalance: isCents(raw.reserveBalance) ? raw.reserveBalance : 0,
    entries,
    ...(investment ? { investment } : {}),
  };
}

function load(): FinancialState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeState(JSON.parse(raw) as Partial<FinancialState>);
  } catch {
    /* armazenamento indisponível */
  }
  return EMPTY_STATE;
}

export function useFinancialState(): [FinancialState, (s: FinancialState) => void, () => void] {
  const [state, setState] = useState<FinancialState>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignora */
    }
  }, [state]);
  return [state, (s) => setState(normalizeState(s)), () => setState(EMPTY_STATE)];
}
