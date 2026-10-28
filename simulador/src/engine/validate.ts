import type { Cents, Goal, GoalOutcome, Plan, PlanEvaluation, Violation } from "../contracts/types";
import { monthlyRequest } from "./budget";
import { formatMoney } from "./money";
import { DEFAULT_WEIGHTS, scoreAllocations } from "./optimizer";

// Valida QUALQUER plano (inclusive o do Gemma) contra o disponível. Nada é corrigido em silêncio:
// o que estiver errado vira violação e o plano é marcado como inválido.
export function evaluatePlan(goals: Goal[], availableCents: Cents, plan: Plan): PlanEvaluation {
  const violations: Violation[] = [];
  const byGoal = new Map<string, Cents>();
  const known = new Set(goals.map((g) => g.id));
  let total = 0;

  for (const a of plan.allocations) {
    if (!Number.isSafeInteger(a.amount)) {
      violations.push({ code: "VALOR_INVALIDO", detail: `valor não é inteiro de centavos para "${a.goalId}"` });
      continue;
    }
    if (a.amount < 0) {
      violations.push({ code: "VALOR_NEGATIVO", detail: `valor negativo para "${a.goalId}": ${formatMoney(a.amount)}` });
      continue;
    }
    if (!known.has(a.goalId)) {
      violations.push({ code: "META_DESCONHECIDA", detail: `meta "${a.goalId}" não existe no cadastro` });
      continue;
    }
    byGoal.set(a.goalId, (byGoal.get(a.goalId) ?? 0) + a.amount);
    total += a.amount;
  }

  // Com disponível negativo (déficit), o teto para alocar é zero: um plano zerado é válido.
  if (total > Math.max(0, availableCents)) {
    violations.push({
      code: "EXCEDE_DISPONIVEL",
      detail: `o plano soma ${formatMoney(total)}, mas o disponível é ${formatMoney(availableCents)} (excede em ${formatMoney(total - availableCents)})`,
    });
  }

  const perGoal: GoalOutcome[] = goals.map((g) => {
    const requested = monthlyRequest(g);
    const allocated = byGoal.get(g.id) ?? 0;
    const status = allocated >= requested ? "atendida" : allocated === 0 ? "zerada" : "reduzida";
    return { goalId: g.id, requested, allocated, status };
  });

  const cleanAllocations = goals.map((g) => ({ goalId: g.id, amount: byGoal.get(g.id) ?? 0 }));
  return {
    plan,
    valid: violations.length === 0,
    violations,
    total,
    leftover: availableCents - total,
    score: scoreAllocations(goals, cleanAllocations, DEFAULT_WEIGHTS),
    perGoal,
  };
}
