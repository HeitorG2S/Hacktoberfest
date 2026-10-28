import type { Allocation, Cents, Goal, Plan, Priority } from "../contracts/types";
import { monthlyRequest } from "./budget";
import { assertCents } from "./money";

// Otimizador: distribui o disponível entre as metas em passos de R$ 10, maximizando
//   pontuação = Σ peso(prioridade) · √(progresso), progresso = alocado / pedido no mês (máx. 1).
// A raiz quadrada é côncava: o primeiro real de uma meta vale mais que o último, então o plano
// equilibra as metas em vez de zerar as de baixa prioridade; o peso faz as prioritárias encherem antes.
// A busca é exata (programação dinâmica sobre meta × orçamento), não heurística.

export const DEFAULT_STEP: Cents = 1000;
export const DEFAULT_WEIGHTS: Record<Priority, number> = { alta: 3, media: 2, baixa: 1 };
const PRIORITY_RANK: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 };
const EPS = 1e-12;

export interface OptimizeOptions {
  stepCents?: Cents;
  weights?: Record<Priority, number>;
}

export function goalScore(goal: Goal, amount: Cents, weights = DEFAULT_WEIGHTS): number {
  const req = monthlyRequest(goal);
  if (req <= 0) return 0;
  const progress = Math.min(amount, req) / req;
  return weights[goal.priority] * Math.sqrt(progress);
}

export function scoreAllocations(goals: Goal[], allocations: Allocation[], weights = DEFAULT_WEIGHTS): number {
  let total = 0;
  for (const g of goals) {
    const amount = allocations.filter((a) => a.goalId === g.id).reduce((s, a) => s + a.amount, 0);
    total += goalScore(g, amount, weights);
  }
  return total;
}

// Opções de valor para uma meta: 0, passo, 2·passo, … limitado ao pedido (o último pode ser o pedido exato).
function choices(req: Cents, step: Cents): { amount: Cents; units: number }[] {
  const out = [{ amount: 0, units: 0 }];
  for (let k = 1; (k - 1) * step < req; k++) out.push({ amount: Math.min(k * step, req), units: k });
  return out;
}

export function optimize(goals: Goal[], availableCents: Cents, opts: OptimizeOptions = {}): Plan {
  const step = opts.stepCents ?? DEFAULT_STEP;
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  assertCents(availableCents, "disponível");
  if (!Number.isSafeInteger(step) || step <= 0) throw new Error(`passo inválido: ${step}`);
  // Teto: nunca mais unidades do que as metas conseguem usar (evita vetor gigante com disponível enorme).
  const usableUnits = goals.reduce((n, g) => n + Math.ceil(monthlyRequest(g) / step), 0);
  const budgetUnits = Math.min(usableUnits, Math.max(0, Math.floor(availableCents / step)));

  // Ordem estável: prioridade mais alta primeiro (desempate favorece a mais prioritária).
  const order = goals.map((g, i) => ({ g, i })).sort((a, b) => PRIORITY_RANK[a.g.priority] - PRIORITY_RANK[b.g.priority] || a.i - b.i);

  // best[u] = melhor pontuação usando no máximo u unidades com as metas já processadas.
  let best: number[] = new Array(budgetUnits + 1).fill(0);
  const picks: number[][] = []; // picks[j][u] = índice da escolha da meta j no ótimo com u unidades
  for (const { g } of order) {
    const opts2 = choices(monthlyRequest(g), step).filter((c) => c.units <= budgetUnits);
    const next: number[] = new Array(budgetUnits + 1).fill(-Infinity);
    const pick: number[] = new Array(budgetUnits + 1).fill(0);
    for (let u = 0; u <= budgetUnits; u++) {
      for (let c = 0; c < opts2.length; c++) {
        const ch = opts2[c]!;
        if (ch.units > u) break;
        const v = best[u - ch.units]! + goalScore(g, ch.amount, weights);
        // Empate: fica com a escolha que dá MENOS à meta atual, deixando o resto às mais prioritárias (vêm antes).
        if (v > next[u]! + EPS) {
          next[u] = v;
          pick[u] = c;
        }
      }
    }
    best = next;
    picks.push(pick);
  }

  // Reconstrói de trás para frente.
  const allocation = new Map<string, Cents>();
  let u = budgetUnits;
  for (let j = order.length - 1; j >= 0; j--) {
    const g = order[j]!.g;
    const ch = choices(monthlyRequest(g), step).filter((c) => c.units <= budgetUnits)[picks[j]![u]!]!;
    allocation.set(g.id, ch.amount);
    u -= ch.units;
  }
  return { label: "otimizado", allocations: goals.map((g) => ({ goalId: g.id, amount: allocation.get(g.id) ?? 0 })) };
}

// Plano alternativo: prioridade estrita. Enche a meta mais prioritária por inteiro antes de passar à próxima.
export function conservativePlan(goals: Goal[], availableCents: Cents, stepCents: Cents = DEFAULT_STEP): Plan {
  assertCents(availableCents, "disponível");
  let left = Math.max(0, availableCents);
  const order = goals.map((g, i) => ({ g, i })).sort((a, b) => PRIORITY_RANK[a.g.priority] - PRIORITY_RANK[b.g.priority] || a.i - b.i);
  const allocation = new Map<string, Cents>();
  for (const { g } of order) {
    const req = monthlyRequest(g);
    const give = req <= left ? req : Math.floor(left / stepCents) * stepCents;
    allocation.set(g.id, give);
    left -= give;
  }
  return { label: "conservador", allocations: goals.map((g) => ({ goalId: g.id, amount: allocation.get(g.id) ?? 0 })) };
}
