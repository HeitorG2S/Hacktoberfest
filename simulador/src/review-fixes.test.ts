import { describe, expect, it } from "vitest";
import type { Entry, Intent } from "./contracts/types";
import { DEMO_STATE } from "./demo";
import { simulate } from "./engine";
import { answerWithDocs } from "./rag/answer";
import { EMPTY_STATE, normalizeState } from "./store";

const intent = (over: Partial<Intent>): Intent => ({
  scenario: "perda_renda", entries: [], tickers: [], months: null, searchTerm: null, goals: [], amount: null, incomeChangePct: null, proposedAllocation: [], missing: [], source: "mock", ...over,
});

describe("achados da review", () => {
  it("perda de renda parte do disponível já ajustado pelos lançamentos do mês", () => {
    const lazer: Entry = { id: "e1", date: "2026-10-05", description: "Show", amount: 20000, type: "despesa", categorySlug: "lazer", source: "manual" };
    const r = simulate({ ...DEMO_STATE, entries: [lazer] }, intent({ incomeChangePct: -10 }), { month: "2026-10" });
    // efetivo 400 (600 − 200 de lazer) − 250 (10% de 2500) = 150
    expect(r.available).toBe(15000);
    expect(r.consequences.find((c) => c.label === "Disponível no mês")).toMatchObject({ before: 40000, after: 15000 });
  });

  it("resposta do modelo que recomenda compra é descartada e o aviso sempre aparece", async () => {
    const docs = [{ id: "brapi:PETR4", source: "brapi" as const, title: "PETR4", text: "PETR4: preço R$ 53,10.", url: null, fetchedAt: "" }];
    const gemma = (answer: string): typeof fetch =>
      (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer, citations: ["brapi:PETR4"] }) }] } }] }), { status: 200 })) as typeof fetch;
    const rec = await answerWithDocs("q", docs, { mode: "api", fetchImpl: gemma("Recomendamos comprar PETR4 a R$ 53,10.") });
    expect(rec.source).toBe("mock");
    const ok = await answerWithDocs("q", docs, { mode: "api", fetchImpl: gemma("A PETR4 está em R$ 53,10.") });
    expect(ok.answer).toContain("não é recomendação de investimento");
  });

  it("estado corrompido no localStorage não derruba o app", () => {
    expect(normalizeState({ budget: { income: "x" } } as never)).toEqual(EMPTY_STATE);
    expect(normalizeState(null)).toEqual(EMPTY_STATE);
    const s = normalizeState({ ...DEMO_STATE, entries: [{ bad: true }, { id: "a", date: "2026-10-01", description: "x", amount: 100, type: "despesa", categorySlug: "mercado", source: "manual" }] } as never);
    expect(s.entries).toHaveLength(1);
    expect(s.goals).toHaveLength(3);
  });
});
