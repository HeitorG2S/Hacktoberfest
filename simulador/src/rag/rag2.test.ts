import { describe, expect, it } from "vitest";
import type { Entry, FinancialState, Intent } from "../contracts/types";
import { DEMO_STATE } from "../demo";
import { daysLeftInMonth, investmentGuidance, spendCheck } from "../engine";
import { answerWithDocs } from "./answer";
import { anonymize, retrieveDocs } from "./retrieve";
import { buildEntryIndex, searchEntries } from "./vector";

const intent = (over: Partial<Intent>): Intent => ({
  scenario: "pode_gastar", entries: [], tickers: [], months: null, searchTerm: null, goals: [], amount: null, incomeChangePct: null, proposedAllocation: [], missing: [], source: "mock", ...over,
});
let n = 0;
const e = (description: string, amount: number, categorySlug: string, date = "2026-10-20"): Entry => ({ id: `e${n++}`, date, description, amount, type: "despesa", categorySlug, source: "manual" });
// Demo: disponível 600, metas pedem 700 → nada livre além das metas. Versão com folga: renda maior.
const roomy: FinancialState = { ...DEMO_STATE, budget: { ...DEMO_STATE.budget, income: 300000 } }; // disponível 1100, livre 400

describe("motor: posso gastar?", () => {
  it("dias restantes contam hoje", () => {
    expect(daysLeftInMonth("2026-10-28")).toBe(4);
    expect(daysLeftInMonth("2026-02-01")).toBe(28);
  });
  it("veredito por faixa", () => {
    // livre 40000 em 4 dias → 10000/dia
    expect(spendCheck(roomy, 8000, "2026-10-28")).toMatchObject({ verdict: "cabe_no_dia", dailyFree: 10000 });
    expect(spendCheck(roomy, 30000, "2026-10-28")).toMatchObject({ verdict: "cabe_no_mes", overDaily: 20000 });
    expect(spendCheck(roomy, 50000, "2026-10-28")).toMatchObject({ verdict: "reduz_metas", goalCut: 10000 });
    expect(spendCheck(roomy, 200000, "2026-10-28")).toMatchObject({ verdict: "nao_cabe", shortfall: 90000 });
  });
});

describe("busca vetorial local", () => {
  const entries = [e("iFood", 4550, "lazer"), e("Rappi lanche", 3000, "lazer"), e("Supermercado Dia", 12000, "mercado"), e("Uber", 1800, "transporte")];
  const index = buildEntryIndex(entries);
  it("termo informal encontra estabelecimentos por sinônimo", () => {
    const r = searchEntries(index, "delivery").map((x) => x.entry.description);
    expect(r).toEqual(expect.arrayContaining(["iFood", "Rappi lanche"]));
    expect(r).not.toContain("Uber");
  });
  it("termo exato vem primeiro", () => {
    expect(searchEntries(index, "ifood")[0]!.entry.description).toBe("iFood");
  });
  it("termo sem relação não retorna nada", () => {
    expect(searchEntries(index, "academia")).toEqual([]);
  });
});

describe("recuperação por intenção", () => {
  const state: FinancialState = { ...roomy, entries: [e("iFood", 28000, "lazer", "2026-10-10")] };
  it("posso gastar: limite do dia, histórico parecido e meta da categoria", async () => {
    const r = await retrieveDocs(intent({ amount: 6000, searchTerm: "ifood" }), state, { month: "2026-10", today: "2026-10-28" });
    expect(r.docs.map((d) => d.id)).toEqual(["motor:limite-dia", "motor:historico", "motor:caixinha", "motor:fixas"]);
    expect(r.docs.every((d) => d.personal)).toBe(true);
    // disponível 1100 − 280 (iFood, lazer) = 820; metas ainda pedem 300 + 250 + 0 (Lazer já consumida) = 550;
    // livre 270 em 4 dias → 67,50/dia; a meta Lazer está zerada, então os 60 saem do livre e cabem no dia.
    expect(r.draft).toContain(`A meta "Lazer" só tem R$ 0,00`);
    expect(r.draft).toContain("cabe no seu limite de hoje (R$ 67,50)");
    expect(r.docs[1]!.text).toContain("R$ 280,00");
  });

  it("posso gastar: gasto que cabe na meta da categoria não mexe no resto", async () => {
    const light: FinancialState = { ...roomy, entries: [e("iFood", 5000, "lazer", "2026-10-10")] };
    const r = await retrieveDocs(intent({ amount: 6000, searchTerm: "ifood" }), light, { month: "2026-10", today: "2026-10-28" });
    // meta Lazer 150 − 50 gastos = 100 restantes ≥ 60
    expect(r.draft).toContain(`Cabe inteiro na meta "Lazer" (ainda tem R$ 100,00)`);
  });

  it("posso gastar: acima do livre do mês reduz metas e oferece alternativa", async () => {
    const r = await retrieveDocs(intent({ amount: 35000, searchTerm: "celular" }), roomy, { month: "2026-10", today: "2026-10-28" });
    // livre 1100 − 700 = 400 → 350 cabe no mês mas passa do dia (100)
    expect(r.draft).toContain("passa R$ 250,00 do seu limite de hoje (R$ 100,00)");
    expect(r.draft).toContain("Alternativa");
  });
  it("consulta: soma por termo", async () => {
    const r = await retrieveDocs(intent({ scenario: "consulta", searchTerm: "delivery" }), state, { month: "2026-10" });
    expect(r.draft).toContain("R$ 280,00");
  });
  it("investimento: trilha começa pela dívida cara e pela reserva", async () => {
    const r = await retrieveDocs(intent({ scenario: "investimento" }), roomy, { month: "2026-10" });
    const ids = r.docs.map((d) => d.id);
    expect(ids).toEqual(["motor:trilha-divida-cara", "motor:trilha-reserva"]);
    expect(r.draft).toContain("Tesouro Selic");
  });
});

describe("trilha de investimento", () => {
  it("sem sobra, diz que não é hora de investir", () => {
    expect(investmentGuidance(DEMO_STATE, "2026-10").steps[0]!.id).toBe("sem-sobra");
  });
  it("sem dívida e com reserva completa, sugere diversificar com valores do motor", () => {
    const rich: FinancialState = { ...roomy, debts: [], reserveBalance: 10_000_000 };
    const g = investmentGuidance(rich, "2026-10");
    expect(g.investable).toBe(40000);
    expect(g.steps.map((s) => s.id)).toEqual(["diversificar"]);
    expect(g.steps[0]!.detail).toContain("R$ 320,00 em renda fixa");
    expect(g.steps[0]!.detail).toContain("R$ 80,00 em renda variável");
  });
});

describe("privacidade e geração", () => {
  it("anonimiza CPF, CNPJ, e-mail e números longos", () => {
    expect(anonymize("Pix para 123.456.789-09, conta 12345678, fulano@x.com, CNPJ 12.345.678/0001-90")).toBe(
      "Pix para [documento], conta [número], [e-mail], CNPJ [documento]",
    );
    expect(anonymize("R$ 1.234.567,89 em 28/10/2026")).toBe("R$ 1.234.567,89 em 28/10/2026");
  });

  const docs = [{ id: "motor:limite-dia", source: "motor" as const, title: "Limite", text: "Limite de hoje R$ 35,00.", url: null, fetchedAt: "", personal: true }];
  const calls: string[] = [];
  const gemma = (answer: string): typeof fetch =>
    (async (_u: unknown, init?: RequestInit) => {
      calls.push(String(init?.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer, citations: ["motor:limite-dia"] }) }] } }] }), { status: 200 });
    }) as typeof fetch;

  it("sem permissão, dado pessoal não vai ao modelo: responde o rascunho local", async () => {
    calls.length = 0;
    const r = await answerWithDocs("posso?", docs, { mode: "api", fetchImpl: gemma("x"), draft: "Dá, mas passa do limite." });
    expect(r.source).toBe("local");
    expect(r.answer).toBe("Dá, mas passa do limite.");
    expect(calls).toHaveLength(0);
  });

  it("com permissão, o Gemma reescreve; sugestões de tipo de aplicação são permitidas", async () => {
    const r = await answerWithDocs("onde invisto?", docs, { mode: "api", fetchImpl: gemma("Sugiro guardar até R$ 35,00 hoje e montar a reserva no Tesouro Selic."), allowPersonal: true });
    expect(r.source).toBe("api");
    expect(calls.at(-1)).toContain("systemInstruction");
  });

  it("ordem de compra de ativo específico é descartada", async () => {
    const r = await answerWithDocs("e PETR4?", docs, { mode: "api", fetchImpl: gemma("Compre PETR4 com os R$ 35,00."), allowPersonal: true, draft: "rascunho" });
    expect(r.answer).toContain("rascunho");
  });
});

import { quickRoute } from "./router";
import { mockInterpret } from "../llm/mock";

describe("roteamento", () => {
  it("atalho local para perguntas comuns (sem IA)", () => {
    expect(quickRoute("Quanto gastei com iFood este mês?")).toMatchObject({ scenario: "consulta", searchTerm: "ifood" });
    expect(quickRoute("quanto tenho?")).toMatchObject({ scenario: "consulta", searchTerm: null });
    expect(quickRoute("Qual minha maior despesa?")).toMatchObject({ scenario: "consulta" });
    expect(quickRoute("Consigo pedir um iFood de 60 hoje?")).toBeNull();
    expect(quickRoute("quanto tenho que guardar para 1800 em 6 meses?")).toBeNull();
  });
  it("mock reconhece 'posso gastar hoje'", () => {
    expect(mockInterpret("Consigo pedir um iFood de R$ 60 hoje sem estourar minhas metas?")).toMatchObject({ scenario: "pode_gastar", amount: 6000, searchTerm: "ifood" });
  });
  it("mock reconhece pedido de sugestão de investimento", () => {
    expect(mockInterpret("Onde invisto o que sobra?").scenario).toBe("investimento");
  });
});
