import type { Budget, Cents, Goal } from "../contracts/types";
import { assertCents, ceilDiv, sum } from "./money";

// Saldo disponível no mês = renda - fixas - essenciais variáveis - mínimos de dívida.
export function available(b: Budget): Cents {
  return assertCents(b.income - b.fixed - b.variableEssential - b.debtMinimums, "disponível");
}

// Quanto a meta pede por mês: sem prazo, o próprio alvo; com prazo, o que falta dividido pelos meses.
export function monthlyRequest(g: Goal): Cents {
  const remaining = Math.max(0, g.target - g.saved);
  return g.deadlineMonths === null ? remaining : ceilDiv(remaining, g.deadlineMonths);
}

export function totalRequested(goals: Goal[]): Cents {
  return sum(goals.map(monthlyRequest));
}
