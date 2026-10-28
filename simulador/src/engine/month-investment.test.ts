import { describe, expect, it } from "vitest";
import type { Entry, FinancialState, Intent } from "../contracts/types";
import { DEMO_STATE } from "../demo";
import { applyPpm, currentMonth, monthlyRatePpm, monthSummary, priceToCents, projectInvestment, sharesFor, simulate, today } from ".";

let n = 0;
const entry = (over: Partial<Entry>): Entry => ({
  id: `e${n++}`, date: "2026-10-05", description: "x", amount: 1000, type: "despesa", categorySlug: "mercado", source: "manual", ...over,
});
const withEntries = (entries: Entry[]): FinancialState => ({ ...DEMO_STATE, entries });

describe("resumo do mês", () => {
  it("sem lançamentos, disponível efetivo = planejado", () => {
    const s = monthSummary(withEntries([]), "2026-10");
    expect(s.effectiveAvailable).toBe(60000);
    expect(s.entriesCount).toBe(0);
  });

  it("despesa essencial dentro do planejado não reduz o disponível", () => {
    const s = monthSummary(withEntries([entry({ amount: 40000, categorySlug: "mercado" })]), "2026-10");
    expect(s.spentByBucket.variableEssential).toBe(40000);
    expect(s.overspend).toBe(0);
    expect(s.effectiveAvailable).toBe(60000);
  });

  it("só o que passa do planejado reduz o disponível", () => {
    const s = monthSummary(withEntries([entry({ amount: 50000 }), entry({ amount: 20000, categorySlug: "saude" })]), "2026-10");
    expect(s.overspend).toBe(5000); // 70000 gastos − 65000 planejados
    expect(s.effectiveAvailable).toBe(55000);
  });

  it("lazer e categoria desconhecida saem direto do disponível; receita extra soma", () => {
    const s = monthSummary(
      withEntries([entry({ amount: 8000, categorySlug: "lazer" }), entry({ amount: 2000, categorySlug: "inventada" }), entry({ amount: 15000, type: "receita", categorySlug: "outros" })]),
      "2026-10",
    );
    expect(s.spentByBucket.discretionary).toBe(10000);
    expect(s.extraIncome).toBe(15000);
    expect(s.effectiveAvailable).toBe(65000);
  });

  it("ignora lançamentos de outros meses", () => {
    const s = monthSummary(withEntries([entry({ date: "2026-09-30", amount: 99999, categorySlug: "lazer" })]), "2026-10");
    expect(s.entriesCount).toBe(0);
    expect(s.effectiveAvailable).toBe(60000);
  });

  it("simulate com mês usa o disponível efetivo e explica", () => {
    const intent: Intent = { scenario: "alocar_metas", entries: [], tickers: [], months: null, goals: [], amount: null, incomeChangePct: null, proposedAllocation: [], missing: [], source: "mock" };
    const r = simulate(withEntries([entry({ amount: 10000, categorySlug: "lazer" })]), intent, { month: "2026-10" });
    expect(r.available).toBe(50000);
    expect(r.plans.find((p) => p.plan.label === "otimizado")!.total).toBe(50000);
    expect(r.explanation.join(" ")).toContain("R$ 500,00");
  });

  it("datas locais", () => {
    expect(currentMonth(new Date(2026, 0, 9))).toBe("2026-01");
    expect(today(new Date(2026, 9, 3))).toBe("2026-10-03");
  });
});

describe("investimento", () => {
  it("taxa mensal equivalente", () => {
    expect(monthlyRatePpm(0)).toBe(0);
    expect(monthlyRatePpm(1200)).toBe(9489); // (1,12)^(1/12) − 1 ≈ 0,9489%
  });

  it("taxa zero: saldo = aportes", () => {
    const p = projectInvestment(10000, 12, 0);
    expect(p.finalBalance).toBe(120000);
    expect(p.interest).toBe(0);
  });

  it("aportes com juros compostos, mês a mês em centavos", () => {
    const p = projectInvestment(100000, 2, 1200);
    // mês 1: 100000 + applyPpm(100000, 9489) = 100949; mês 2: 200949 + applyPpm(200949, 9489) = 202856
    expect(p.series.map((x) => x.balance)).toEqual([100949, 202856]);
    expect(p.totalContributed).toBe(200000);
    expect(p.interest).toBe(2856);
    for (const x of p.series) expect(Number.isSafeInteger(x.balance)).toBe(true);
  });

  it("um ano a 12% a.a. com aporte único equivale a ~12%", () => {
    const p = projectInvestment(0, 12, 1200);
    expect(p.finalBalance).toBe(0);
    let b = 100000;
    for (let i = 0; i < 12; i++) b += applyPpm(b, monthlyRatePpm(1200));
    expect(Math.abs(b - 112000)).toBeLessThanOrEqual(5);
  });

  it("rejeita prazo e taxa inválidos", () => {
    expect(() => projectInvestment(100, 0, 1000)).toThrow();
    expect(() => projectInvestment(100, 12, -1)).toThrow();
    expect(() => projectInvestment(-1, 12, 1000)).toThrow();
  });

  it("cotas inteiras", () => {
    expect(sharesFor(100000, 5310)).toEqual({ shares: 18, cost: 95580, leftover: 4420 });
    expect(sharesFor(1000, 0)).toEqual({ shares: 0, cost: 0, leftover: 1000 });
  });

  it("preço da API vira centavos", () => {
    expect(priceToCents(53.1)).toBe(5310);
    expect(priceToCents(9.875)).toBeGreaterThanOrEqual(987);
    expect(() => priceToCents(Number.NaN)).toThrow();
    expect(() => priceToCents(-1)).toThrow();
  });
});
