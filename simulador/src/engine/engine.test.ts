import { describe, expect, it } from "vitest";
import type { Goal, Intent, Plan } from "../contracts/types";
import { DEMO_STATE } from "../demo";
import { available, conservativePlan, evaluatePlan, matchGoal, monthlyRequest, optimize, projectDebt, simulate } from ".";

const goals = DEMO_STATE.goals;
const AVAIL = available(DEMO_STATE.budget);
const amounts = (p: Plan) => Object.fromEntries(p.allocations.map((a) => [a.goalId, a.amount]));
const total = (p: Plan) => p.allocations.reduce((s, a) => s + a.amount, 0);
const intent = (over: Partial<Intent>): Intent => ({
  scenario: "alocar_metas", entries: [], tickers: [], months: null, goals: [], amount: null, incomeChangePct: null, proposedAllocation: [], missing: [], source: "mock", ...over,
});
const withPriority = (id: string, priority: Goal["priority"]) => goals.map((g) => (g.id === id ? { ...g, priority } : g));

describe("orçamento", () => {
  it("disponível da demo fecha em R$ 600", () => expect(AVAIL).toBe(60000));
  it("meta com prazo pede o restante dividido pelos meses, arredondado para cima", () => {
    expect(monthlyRequest({ ...goals[1]!, target: 180000, deadlineMonths: 6 })).toBe(30000);
    expect(monthlyRequest({ ...goals[1]!, target: 100000, saved: 0, deadlineMonths: 3 })).toBe(33334);
    expect(monthlyRequest({ ...goals[1]!, target: 100000, saved: 100000, deadlineMonths: 3 })).toBe(0);
  });
});

describe("otimizador", () => {
  it("metas incompatíveis: usa exatamente o disponível, sem exceder, em passos de R$ 10", () => {
    const p = optimize(goals, AVAIL);
    expect(total(p)).toBe(60000);
    for (const a of p.allocations) expect(a.amount % 1000).toBe(0);
    expect(amounts(p)).toEqual({ reserva: 30000, computador: 21000, lazer: 9000 });
  });

  it("prioridade alta é atendida integralmente; ninguém recebe mais do que pede", () => {
    const p = amounts(optimize(goals, AVAIL));
    expect(p.reserva).toBe(30000);
    for (const g of goals) expect(p[g.id]).toBeLessThanOrEqual(monthlyRequest(g));
  });

  it("mudar a prioridade do computador muda a distribuição", () => {
    const base = amounts(optimize(goals, AVAIL));
    const alta = amounts(optimize(withPriority("computador", "alta"), AVAIL));
    const baixa = amounts(optimize(withPriority("computador", "baixa"), AVAIL));
    expect(alta.computador).toBeGreaterThan(base.computador!);
    expect(baixa.computador).toBeLessThan(base.computador!);
    expect(alta).not.toEqual(base);
  });

  it("quando tudo cabe, atende tudo e deixa sobra", () => {
    const p = optimize(goals, 100000);
    expect(amounts(p)).toEqual({ reserva: 30000, computador: 25000, lazer: 15000 });
  });

  it("disponível zero dá plano zerado; menos que um passo vai inteiro para a meta mais prioritária", () => {
    expect(total(optimize(goals, 0))).toBe(0);
    expect(amounts(optimize(goals, 900))).toEqual({ reserva: 900, computador: 0, lazer: 0 });
  });

  it("pedido não múltiplo do passo é atendido exatamente quando cabe (achado da review)", () => {
    const g: Goal[] = [{ id: "m", name: "M", target: 100000, saved: 0, deadlineMonths: 3, priority: "media" }];
    expect(amounts(optimize(g, 33334)).m).toBe(33334);
  });

  it("pedido que não é múltiplo do passo pode ser atendido exatamente", () => {
    const g: Goal[] = [{ id: "x", name: "X", target: 12345, saved: 0, deadlineMonths: null, priority: "alta" }];
    expect(amounts(optimize(g, 20000)).x).toBe(12345);
  });

  it("empate exato favorece a meta que vem primeiro (desempate estável)", () => {
    const g: Goal[] = ["a", "b"].map((id) => ({ id, name: id, target: 10000, saved: 0, deadlineMonths: null, priority: "media" as const }));
    expect(amounts(optimize(g, 1000))).toEqual({ a: 1000, b: 0 });
  });

  it("é determinístico", () => expect(optimize(goals, AVAIL)).toEqual(optimize(goals, AVAIL)));

  it("plano conservador enche por prioridade estrita", () => {
    expect(amounts(conservativePlan(goals, AVAIL))).toEqual({ reserva: 30000, computador: 25000, lazer: 5000 });
  });
});

describe("validação de planos", () => {
  it("plano otimizado e conservador são válidos", () => {
    expect(evaluatePlan(goals, AVAIL, optimize(goals, AVAIL)).valid).toBe(true);
    expect(evaluatePlan(goals, AVAIL, conservativePlan(goals, AVAIL)).valid).toBe(true);
  });

  it("plano do LLM que excede o disponível é rejeitado com o excesso explicado", () => {
    const e = evaluatePlan(goals, AVAIL, { label: "gemma", allocations: [
      { goalId: "reserva", amount: 30000 }, { goalId: "computador", amount: 25000 }, { goalId: "lazer", amount: 15000 } ] });
    expect(e.valid).toBe(false);
    expect(e.violations.map((v) => v.code)).toEqual(["EXCEDE_DISPONIVEL"]);
    expect(e.leftover).toBe(-10000);
    expect(e.violations[0]!.detail).toContain("R$ 100,00");
  });

  it("valor negativo, meta inexistente e não inteiro são violações", () => {
    const e = evaluatePlan(goals, AVAIL, { label: "gemma", allocations: [
      { goalId: "reserva", amount: -100 }, { goalId: "viagem", amount: 1000 }, { goalId: "lazer", amount: 10.5 } ] });
    expect(e.valid).toBe(false);
    expect(e.violations.map((v) => v.code).sort()).toEqual(["META_DESCONHECIDA", "VALOR_INVALIDO", "VALOR_NEGATIVO"]);
  });

  it("status por meta: atendida, reduzida, zerada", () => {
    const e = evaluatePlan(goals, AVAIL, { label: "otimizado", allocations: [{ goalId: "reserva", amount: 30000 }, { goalId: "computador", amount: 1000 }] });
    expect(e.perGoal.map((o) => o.status)).toEqual(["atendida", "reduzida", "zerada"]);
  });
});

describe("simulação por cenário", () => {
  it("pedido da demo: detecta incompatibilidade e invalida plano do Gemma que excede", () => {
    const r = simulate(DEMO_STATE, intent({ proposedAllocation: [
      { goal: "Reserva", amount: 30000 }, { goal: "computador", amount: 25000 }, { goal: "lazer", amount: 10000 } ] }));
    expect(r.feasible).toBe(false);
    expect(r.plans.map((p) => p.plan.label)).toEqual(["gemma", "otimizado", "conservador"]);
    expect(r.plans[0]!.valid).toBe(false);
    expect(r.plans.slice(1).every((p) => p.valid && p.total <= r.available)).toBe(true);
    expect(r.explanation.join(" ")).toContain("faltam R$ 100,00");
  });

  it("plano do Gemma válido é aceito", () => {
    const r = simulate(DEMO_STATE, intent({ proposedAllocation: [
      { goal: "reserva", amount: 30000 }, { goal: "computador", amount: 20000 }, { goal: "lazer", amount: 10000 } ] }));
    expect(r.plans[0]!.valid).toBe(true);
  });

  it("computador de R$ 1.800 em 6 meses vira R$ 300/mês e o prazo efetivo é informado", () => {
    const r = simulate(DEMO_STATE, intent({ scenario: "meta_com_prazo", goals: [{ name: "computador", amount: 180000, deadlineMonths: 6, priority: null }] }));
    const opt = r.plans.find((p) => p.plan.label === "otimizado")!;
    expect(opt.perGoal.find((o) => o.goalId === "computador")!.requested).toBe(30000);
    expect(opt.total).toBe(60000);
    expect(r.explanation.join(" ")).toMatch(/leva \d+ meses em vez de 6/);
  });

  it("compra que não cabe: disponível negativo, planos zerados e válidos, meses para juntar", () => {
    const r = simulate(DEMO_STATE, intent({ scenario: "compra", amount: 200000 }));
    expect(r.available).toBe(-140000);
    expect(r.plans.every((p) => p.valid && p.total === 0)).toBe(true);
    expect(r.explanation.join(" ")).toContain("leva 4 meses");
  });

  it("objeto da compra não vira meta nova", () => {
    const r = simulate(DEMO_STATE, intent({ scenario: "compra", amount: 200000, goals: [{ name: "celular", amount: 200000, deadlineMonths: null, priority: null }] }));
    expect(r.plans[0]!.perGoal.map((o) => o.goalId)).toEqual(["reserva", "computador", "lazer"]);
  });

  it("compra que cabe reduz o disponível das metas", () => {
    const r = simulate(DEMO_STATE, intent({ scenario: "compra", amount: 20000 }));
    expect(r.available).toBe(40000);
    expect(r.plans.find((p) => p.plan.label === "otimizado")!.total).toBe(40000);
  });

  it("despesa inesperada mostra de quais metas o dinheiro sai", () => {
    const r = simulate(DEMO_STATE, intent({ scenario: "despesa_inesperada", amount: 40000 }));
    expect(r.available).toBe(20000);
    const cortes = r.consequences.filter((c) => c.label.startsWith("Retirado da meta"));
    expect(cortes.length).toBeGreaterThan(0);
    const retirado = cortes.reduce((s, c) => s + (c.before! - c.after!), 0);
    expect(retirado).toBe(40000);
  });

  it("perda de 30% da renda gera déficit e zera as metas", () => {
    const r = simulate(DEMO_STATE, intent({ scenario: "perda_renda", incomeChangePct: -30 }));
    expect(r.consequences[0]).toMatchObject({ before: 250000, after: 175000 });
    expect(r.available).toBe(-15000);
    expect(r.plans.every((p) => p.total === 0)).toBe(true);
  });

  it("dívida × reserva: avisa que o mínimo não cobre os juros e aplica a regra da reserva", () => {
    const r = simulate(DEMO_STATE, intent({ scenario: "divida_vs_reserva" }));
    const txt = r.explanation.join(" ");
    expect(txt).toContain("não cobre os juros");
    expect(txt).toContain("Monte essa reserva primeiro");
  });
});

describe("dívida", () => {
  it("projeção com juros compostos e quitação", () => {
    const d = { id: "d", name: "D", balance: 100000, minPayment: 0, monthlyRateBps: 1000 };
    const p = projectDebt(d, 60000);
    // mês 1: 100000 + 10000 - 60000 = 50000; mês 2: 50000 + 5000 - 55000 = 0
    expect(p.months).toBe(2);
    expect(p.interestPaid).toBe(15000);
    expect(p.balanceAt(1)).toBe(50000);
  });
  it("pagamento que não cobre os juros não quita", () => {
    const p = projectDebt({ id: "d", name: "D", balance: 300000, minPayment: 25000, monthlyRateBps: 1200 }, 25000, 24);
    expect(p.months).toBeNull();
    expect(p.coversInterest).toBe(false);
    expect(p.balanceAt(24)).toBeGreaterThan(300000);
  });
});

describe("correspondência de nomes", () => {
  it("sinônimos e acentos", () => {
    expect(matchGoal(goals, "emergências")?.id).toBe("reserva");
    expect(matchGoal(goals, "notebook")?.id).toBe("computador");
    expect(matchGoal(goals, "Lazer")?.id).toBe("lazer");
    expect(matchGoal(goals, "viagem")).toBeUndefined();
  });
});
