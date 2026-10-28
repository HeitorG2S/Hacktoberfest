import { describe, expect, it } from "vitest";
import type { Cents, Debt, Goal, Intent, Plan, Priority, ScenarioType } from "../contracts/types";
import { DEMO_STATE } from "../demo";
import {
  applyBps,
  available,
  ceilDiv,
  conservativePlan,
  evaluatePlan,
  monthlyRequest,
  MoneyError,
  optimize,
  parseMoney,
  projectDebt,
  scoreAllocations,
  simulate,
  sum,
  toMoneyText,
  totalRequested,
} from "./index";

const goals = DEMO_STATE.goals;

describe("Invariante 1: Limites do disponível em planos otimizado e conservador", () => {
  it("invariante 1: plano otimizado não excede disponível em casos normais, zero e menor que o passo", () => {
    // Disponível zero
    const optZero = optimize(goals, 0);
    const totalZero = optZero.allocations.reduce((s, a) => s + a.amount, 0);
    expect(totalZero).toBe(0);
    expect(totalZero).toBeLessThanOrEqual(0);

    // Disponível menor que o passo (R$ 5,00 < R$ 10,00)
    const optSmall = optimize(goals, 500);
    const totalSmall = optSmall.allocations.reduce((s, a) => s + a.amount, 0);
    // Com o complemento pós-busca, o valor menor que o passo vai para a meta mais prioritária.
    expect(totalSmall).toBe(500);
    expect(totalSmall).toBeLessThanOrEqual(500);

    // Disponível padrão (R$ 600,00)
    const optNormal = optimize(goals, 60000);
    const totalNormal = optNormal.allocations.reduce((s, a) => s + a.amount, 0);
    expect(totalNormal).toBe(60000);
    expect(totalNormal).toBeLessThanOrEqual(60000);

    // Disponível com folga (R$ 1.000,00 para metas de R$ 700,00)
    const optSurplus = optimize(goals, 100000);
    const totalSurplus = optSurplus.allocations.reduce((s, a) => s + a.amount, 0);
    expect(totalSurplus).toBe(70000);
    expect(totalSurplus).toBeLessThanOrEqual(100000);
  });

  it("invariante 1: plano conservador não excede disponível em casos normais, zero e menor que o passo", () => {
    // Disponível zero
    const consZero = conservativePlan(goals, 0);
    const totalZero = consZero.allocations.reduce((s, a) => s + a.amount, 0);
    expect(totalZero).toBe(0);
    expect(totalZero).toBeLessThanOrEqual(0);

    // Disponível menor que o passo (R$ 5,00 < R$ 10,00)
    const consSmall = conservativePlan(goals, 500);
    const totalSmall = consSmall.allocations.reduce((s, a) => s + a.amount, 0);
    // Com o complemento pós-busca, o valor menor que o passo vai para a meta mais prioritária.
    expect(totalSmall).toBe(500);
    expect(totalSmall).toBeLessThanOrEqual(500);

    // Disponível padrão (R$ 600,00)
    const consNormal = conservativePlan(goals, 60000);
    const totalNormal = consNormal.allocations.reduce((s, a) => s + a.amount, 0);
    expect(totalNormal).toBe(60000);
    expect(totalNormal).toBeLessThanOrEqual(60000);

    // Disponível com folga (R$ 1.000,00 para metas de R$ 700,00)
    const consSurplus = conservativePlan(goals, 100000);
    const totalSurplus = consSurplus.allocations.reduce((s, a) => s + a.amount, 0);
    expect(totalSurplus).toBe(70000);
    expect(totalSurplus).toBeLessThanOrEqual(100000);
  });

  // CORRIGIDO (achado W5): com disponível negativo (-1000), optimize produz plano com total 0, que excede o disponível negativo (-1000) e é rejeitado por evaluatePlan
  it("invariante 1: plano otimizado não excede disponível quando disponível é negativo", () => {
    // Déficit: o teto para alocar é zero; plano zerado e válido.
    const p = optimize(goals, -1000);
    const total = p.allocations.reduce((s, a) => s + a.amount, 0);
    expect(total).toBe(0);
    expect(evaluatePlan(goals, -1000, p).valid).toBe(true);
  });

  // CORRIGIDO (achado W5): com disponível negativo (-1000), conservativePlan produz plano com total 0, que excede o disponível negativo (-1000)
  it("invariante 1: plano conservador não excede disponível quando disponível é negativo", () => {
    // Déficit: o teto para alocar é zero; plano zerado e válido.
    const p = conservativePlan(goals, -1000);
    const total = p.allocations.reduce((s, a) => s + a.amount, 0);
    expect(total).toBe(0);
    expect(evaluatePlan(goals, -1000, p).valid).toBe(true);
  });

  // CORRIGIDO (achado W5): com disponível enorme (Number.MAX_SAFE_INTEGER), optimize tenta alocar array de tamanho proporcional ao disponível (9 trilhões) e lança RangeError em vez de limitar ao total requisitado pelas metas
  it("invariante 1: optimize suporta disponível enorme sem estourar limite de array", () => {
    const p = optimize(goals, Number.MAX_SAFE_INTEGER);
    const total = p.allocations.reduce((s, a) => s + a.amount, 0);
    expect(total).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });
});

describe("Invariante 2: Nenhuma meta recebe mais do que pede no mês", () => {
  it("invariante 2: metas nunca recebem mais que monthlyRequest em planos otimizado e conservador", () => {
    const testGoals: Goal[] = [
      { id: "g1", name: "Meta 1", target: 30000, saved: 0, deadlineMonths: null, priority: "alta" },
      { id: "g2", name: "Meta 2", target: 20000, saved: 5000, deadlineMonths: 5, priority: "media" }, // pede ceilDiv(15000, 5) = 3000
      { id: "g3", name: "Meta 3", target: 10000, saved: 10000, deadlineMonths: 2, priority: "baixa" }, // já poupado integralmente: pede 0
      { id: "g4", name: "Meta 4", target: 12345, saved: 0, deadlineMonths: null, priority: "alta" }, // valor não múltiplo do passo
    ];
    const budgets = [0, 500, 1000, 5000, 10000, 50000, 200000];

    for (const b of budgets) {
      const opt = optimize(testGoals, b);
      for (const a of opt.allocations) {
        const g = testGoals.find((x) => x.id === a.goalId)!;
        const req = monthlyRequest(g);
        expect(a.amount).toBeLessThanOrEqual(req);
        expect(a.amount).toBeGreaterThanOrEqual(0);
      }

      const cons = conservativePlan(testGoals, b);
      for (const a of cons.allocations) {
        const g = testGoals.find((x) => x.id === a.goalId)!;
        const req = monthlyRequest(g);
        expect(a.amount).toBeLessThanOrEqual(req);
        expect(a.amount).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("Invariante 3: Todos os valores de saída são inteiros seguros", () => {
  it("invariante 3: todos os valores monetários de saída em todas as funções são inteiros seguros", () => {
    // Módulo money
    expect(Number.isSafeInteger(parseMoney("1234.56"))).toBe(true);
    expect(Number.isSafeInteger(ceilDiv(100000, 3))).toBe(true);
    expect(Number.isSafeInteger(applyBps(300000, 1200))).toBe(true);
    expect(Number.isSafeInteger(sum([100, 200, 300]))).toBe(true);

    // Módulo budget
    expect(Number.isSafeInteger(available(DEMO_STATE.budget))).toBe(true);
    for (const g of DEMO_STATE.goals) {
      expect(Number.isSafeInteger(monthlyRequest(g))).toBe(true);
    }
    expect(Number.isSafeInteger(totalRequested(DEMO_STATE.goals))).toBe(true);

    // Módulo optimizer
    const opt = optimize(DEMO_STATE.goals, 60000);
    for (const a of opt.allocations) {
      expect(Number.isSafeInteger(a.amount)).toBe(true);
    }
    const cons = conservativePlan(DEMO_STATE.goals, 60000);
    for (const a of cons.allocations) {
      expect(Number.isSafeInteger(a.amount)).toBe(true);
    }

    // Módulo validate
    const evalOpt = evaluatePlan(DEMO_STATE.goals, 60000, opt);
    expect(Number.isSafeInteger(evalOpt.total)).toBe(true);
    expect(Number.isSafeInteger(evalOpt.leftover)).toBe(true);
    for (const pg of evalOpt.perGoal) {
      expect(Number.isSafeInteger(pg.requested)).toBe(true);
      expect(Number.isSafeInteger(pg.allocated)).toBe(true);
    }

    // Módulo scenarios - projectDebt
    const debt = DEMO_STATE.debts[0]!;
    const proj = projectDebt(debt, 30000, 12);
    expect(Number.isSafeInteger(proj.interestPaid)).toBe(true);
    if (proj.months !== null) expect(Number.isSafeInteger(proj.months)).toBe(true);
    expect(Number.isSafeInteger(proj.balanceAt(1))).toBe(true);
    expect(Number.isSafeInteger(proj.interestUntil(1))).toBe(true);

    // Módulo scenarios - simulate
    const sim = simulate(DEMO_STATE, {
      scenario: "compra",
      entries: [],
      tickers: [],
      months: null,
      amount: 20000,
      goals: [],
      incomeChangePct: null,
      proposedAllocation: [],
      missing: [],
      source: "mock",
    });
    expect(Number.isSafeInteger(sim.available)).toBe(true);
    for (const c of sim.consequences) {
      if (c.before !== null) expect(Number.isSafeInteger(c.before)).toBe(true);
      if (c.after !== null) expect(Number.isSafeInteger(c.after)).toBe(true);
    }
  });
});

describe("Invariante 4: Otimalidade do otimizador contra busca exaustiva", () => {
  // Busca exaustiva em passos de R$ 10 (1000 centavos)
  function bruteForceSearch(testGoals: Goal[], availCents: Cents, stepCents = 1000): number {
    const reqs = testGoals.map(monthlyRequest);
    let bestScore = -1;

    function recurse(idx: number, remaining: Cents, current: { goalId: string; amount: Cents }[]) {
      if (idx === testGoals.length) {
        const score = scoreAllocations(testGoals, current);
        if (score > bestScore) bestScore = score;
        return;
      }
      const g = testGoals[idx]!;
      const req = reqs[idx]!;
      const maxUnits = Math.min(Math.floor(remaining / stepCents), Math.ceil(req / stepCents));
      for (let u = 0; u <= maxUnits; u++) {
        const amt = Math.min(u * stepCents, req);
        if (amt <= remaining) {
          current.push({ goalId: g.id, amount: amt });
          recurse(idx + 1, remaining - amt, current);
          current.pop();
        }
      }
    }

    recurse(0, availCents, []);
    return Math.max(0, bestScore);
  }

  it("invariante 4: optimize é ótimo para instâncias com passos de R$ 10 comparado com busca exaustiva", () => {
    const smallGoals: Goal[] = [
      { id: "a", name: "Meta A", target: 30000, saved: 0, deadlineMonths: null, priority: "alta" },
      { id: "b", name: "Meta B", target: 20000, saved: 0, deadlineMonths: null, priority: "media" },
      { id: "c", name: "Meta C", target: 10000, saved: 0, deadlineMonths: null, priority: "baixa" },
    ];
    const budgets = [0, 5000, 10000, 15000, 20000, 25000, 30000];

    for (const b of budgets) {
      const opt = optimize(smallGoals, b);
      const optScore = scoreAllocations(smallGoals, opt.allocations);
      const bruteScore = bruteForceSearch(smallGoals, b);
      expect(optScore).toBeGreaterThanOrEqual(bruteScore - 1e-9);
    }
  });

  // CORRIGIDO (achado W5 e da review): o complemento pós-busca aloca os centavos que a busca em passos deixava de fora.
  it("invariante 4: optimize é ótimo para metas com pedidos fracionários menores que o passo", () => {
    const fractionalGoals: Goal[] = [
      { id: "a", name: "A", target: 1500, saved: 0, deadlineMonths: null, priority: "alta" },
      { id: "b", name: "B", target: 500, saved: 0, deadlineMonths: null, priority: "alta" },
    ];
    // Disponível R$ 20. Ambas as metas somam 1500 + 500 = 2000 <= 2000.
    // Ótimo real: score = 3 * sqrt(1) + 3 * sqrt(1) = 6.0
    const opt = optimize(fractionalGoals, 2000);
    const optScore = scoreAllocations(fractionalGoals, opt.allocations);
    expect(optScore).toBeGreaterThanOrEqual(6.0 - 1e-9);
  });
});

describe("Invariante 5: Monotonicidade da prioridade no plano otimizado", () => {
  it("invariante 5: aumentar a prioridade de uma meta nunca diminui o valor dela no plano otimizado (monotonicidade)", () => {
    const priorities: Priority[] = ["baixa", "media", "alta"];
    const budgets = [10000, 20000, 30000, 40000, 50000, 60000];

    for (const b of budgets) {
      for (let targetGoalIdx = 0; targetGoalIdx < 3; targetGoalIdx++) {
        let prevAmount = -1;
        for (const p of priorities) {
          const testGoals: Goal[] = [
            { id: "g1", name: "Meta 1", target: 30000, saved: 0, deadlineMonths: null, priority: "media" },
            { id: "g2", name: "Meta 2", target: 25000, saved: 0, deadlineMonths: null, priority: "media" },
            { id: "g3", name: "Meta 3", target: 15000, saved: 0, deadlineMonths: null, priority: "media" },
          ];
          testGoals[targetGoalIdx]!.priority = p;
          const plan = optimize(testGoals, b);
          const allocated = plan.allocations.find((a) => a.goalId === testGoals[targetGoalIdx]!.id)!.amount;
          if (prevAmount >= 0) {
            expect(allocated).toBeGreaterThanOrEqual(prevAmount);
          }
          prevAmount = allocated;
        }
      }
    }
  });
});

describe("Invariante 6: Validação de planos com evaluatePlan", () => {
  it("invariante 6: evaluatePlan rejeita qualquer plano que some mais que o disponível e aceita os que somam exatamente o disponível", () => {
    const avail = 60000;

    // Plano que soma exatamente o disponível (R$ 600,00)
    const exactPlan: Plan = {
      label: "otimizado",
      allocations: [
        { goalId: "reserva", amount: 30000 },
        { goalId: "computador", amount: 20000 },
        { goalId: "lazer", amount: 10000 },
      ],
    };
    const exactEval = evaluatePlan(goals, avail, exactPlan);
    expect(exactEval.valid).toBe(true);
    expect(exactEval.total).toBe(avail);
    expect(exactEval.leftover).toBe(0);
    expect(exactEval.violations).toHaveLength(0);

    // Plano que excede em 1 centavo (R$ 600,01)
    const overPlan1: Plan = {
      label: "gemma",
      allocations: [
        { goalId: "reserva", amount: 30000 },
        { goalId: "computador", amount: 20000 },
        { goalId: "lazer", amount: 10001 },
      ],
    };
    const overEval1 = evaluatePlan(goals, avail, overPlan1);
    expect(overEval1.valid).toBe(false);
    expect(overEval1.violations.some((v) => v.code === "EXCEDE_DISPONIVEL")).toBe(true);
    expect(overEval1.leftover).toBe(-1);

    // Plano com disponível zero somando exatamente zero é aceito
    const zeroPlan: Plan = {
      label: "conservador",
      allocations: [
        { goalId: "reserva", amount: 0 },
        { goalId: "computador", amount: 0 },
        { goalId: "lazer", amount: 0 },
      ],
    };
    const zeroEval = evaluatePlan(goals, 0, zeroPlan);
    expect(zeroEval.valid).toBe(true);
    expect(zeroEval.total).toBe(0);
    expect(zeroEval.leftover).toBe(0);

    // Plano com disponível zero somando 1 centavo é rejeitado
    const zeroOverPlan: Plan = {
      label: "gemma",
      allocations: [
        { goalId: "reserva", amount: 1 },
        { goalId: "computador", amount: 0 },
        { goalId: "lazer", amount: 0 },
      ],
    };
    const zeroOverEval = evaluatePlan(goals, 0, zeroOverPlan);
    expect(zeroOverEval.valid).toBe(false);
    expect(zeroOverEval.violations.some((v) => v.code === "EXCEDE_DISPONIVEL")).toBe(true);
  });
});

describe("Invariante 7: parseMoney integridade, rejeição de malformados e ida e volta", () => {
  it("invariante 7: parseMoney nunca devolve não-inteiro e rejeita entradas ambíguas ou malformadas", () => {
    const malformed = [
      "",
      "   ",
      "\t\n",
      "abc",
      "R$",
      "R$ ",
      "-",
      "-R$",
      "R$ -",
      "--100",
      "-R$ -50",
      "12,345", // 3 dígitos decimais após vírgula
      "1,2345", // 4 dígitos após vírgula
      "1.2345", // 4 dígitos após ponto
      "1.2.3",
      "1,2,3",
      "12.345.67",
      "12.345,67.89",
      "1.234,567",
      "12.34,56",
      "1.23.456,78",
      ".50",
      ",50",
      "1.",
      "1,",
      "+100",
      "NaN",
      "Infinity",
      "-Infinity",
      "1e5",
      "0x10",
    ];

    for (const s of malformed) {
      expect(() => parseMoney(s)).toThrow(MoneyError);
    }
  });

  it("invariante 7: ida e volta toMoneyText/parseMoney para valores aleatórios com gerador determinístico LCG", () => {
    // Gerador Congruencial Linear determinístico com semente fixa (sem Math.random)
    let seed = 42;
    function lcg(): number {
      seed = (1664525 * seed + 1013904223) % 4294967296;
      return seed;
    }

    // Casos de borda explícitos
    const edgeCases: Cents[] = [
      0, 1, -1, 5, -5, 99, -99, 100, -100, 101, -101, 123456, -123456, 100000000, -100000000,
    ];
    for (const c of edgeCases) {
      const text = toMoneyText(c);
      const parsed = parseMoney(text);
      expect(parsed).toBe(c);
      expect(Number.isSafeInteger(parsed)).toBe(true);
    }

    // 1000 valores pseudo-aleatórios determinísticos no intervalo de -R$ 10 milhões a +R$ 10 milhões
    for (let i = 0; i < 1000; i++) {
      const raw = lcg();
      const c = (raw % 2000000001) - 1000000000;
      const text = toMoneyText(c);
      const parsed = parseMoney(text);
      expect(parsed).toBe(c);
      expect(Number.isSafeInteger(parsed)).toBe(true);
    }
  });
});

describe("Invariante 8: simulate robustez com valores extremos e explicação não vazia", () => {
  it("invariante 8: simulate nunca lança para Intents válidas de todos os cenários com valores extremos e sempre devolve explanation não vazia", () => {
    const scenarios: ScenarioType[] = [
      "alocar_metas",
      "compra",
      "meta_com_prazo",
      "despesa_inesperada",
      "divida_vs_reserva",
      "perda_renda",
      "desconhecido",
    ];
    const extremeAmounts: (Cents | null)[] = [0, 1, 1000000000]; // 0, 1 centavo, R$ 10 milhões

    for (const scenario of scenarios) {
      for (const amount of extremeAmounts) {
        const intent: Intent = {
          scenario,
          entries: [],
          tickers: [],
          months: null,
          goals:
            scenario === "meta_com_prazo"
              ? [{ name: "computador", amount: amount ?? 30000, deadlineMonths: 6, priority: "alta" }]
              : [],
          amount,
          incomeChangePct: scenario === "perda_renda" ? (amount === 0 ? 0 : amount === 1 ? -10 : -100) : null,
          proposedAllocation: [],
          missing: [],
          source: "mock",
        };

        const result = simulate(DEMO_STATE, intent);
        expect(result).toBeDefined();
        expect(result.explanation).toBeDefined();
        expect(result.explanation.length).toBeGreaterThan(0);
        for (const line of result.explanation) {
          expect(typeof line).toBe("string");
          expect(line.trim().length).toBeGreaterThan(0);
        }
        expect(Number.isSafeInteger(result.available)).toBe(true);
        expect(Array.isArray(result.plans)).toBe(true);
        expect(result.plans.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("Invariante 9: projectDebt juros acumulados e quitação", () => {
  it("invariante 9: projectDebt juros acumulados = soma dos juros mensais e quitação nunca deixa saldo negativo", () => {
    const testDebts: Debt[] = [
      { id: "cartao", name: "Cartão", balance: 300000, minPayment: 25000, monthlyRateBps: 1200 },
      { id: "cheque", name: "Cheque Especial", balance: 100000, minPayment: 10000, monthlyRateBps: 800 },
      { id: "consignado", name: "Consignado", balance: 500000, minPayment: 50000, monthlyRateBps: 180 },
      { id: "pequena", name: "Pequena Dívida", balance: 5000, minPayment: 1000, monthlyRateBps: 200 },
    ];
    const payments: Cents[] = [
      1000, // pagamento baixo
      15000, // pagamento médio
      60000, // pagamento que quita
      1000000000, // pagamento enorme (R$ 10 milhões) para testar sobrepagamento
    ];

    for (const debt of testDebts) {
      for (const payment of payments) {
        const proj = projectDebt(debt, payment, 240);

        // Invariante: quitação nunca deixa saldo negativo em nenhum mês consultado
        const horizon = proj.months ?? 240;
        for (let m = 0; m <= horizon + 5; m++) {
          const bal = proj.balanceAt(m);
          expect(bal).toBeGreaterThanOrEqual(0);
          expect(Number.isSafeInteger(bal)).toBe(true);
        }

        // Se quitou, no mês da quitação o saldo é exatamente 0 e nos meses seguintes continua 0
        if (proj.months !== null) {
          expect(proj.balanceAt(proj.months)).toBe(0);
          expect(proj.balanceAt(proj.months + 1)).toBe(0);
          expect(proj.balanceAt(proj.months + 10)).toBe(0);

          // Invariante: juros acumulados = soma dos juros mensais
          let sumMonthly = 0;
          for (let m = 1; m <= proj.months; m++) {
            const monthlyInterest = proj.interestUntil(m) - proj.interestUntil(m - 1);
            expect(monthlyInterest).toBeGreaterThanOrEqual(0);
            sumMonthly += monthlyInterest;
          }
          expect(proj.interestPaid).toBe(sumMonthly);
          expect(proj.interestUntil(proj.months)).toBe(sumMonthly);
        }
      }
    }
  });
});
