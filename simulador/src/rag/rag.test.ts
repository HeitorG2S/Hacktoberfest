import { describe, expect, it } from "vitest";
import type { FinancialState, Intent, Quote } from "../contracts/types";
import { DEMO_STATE } from "../demo";
import { answerWithDocs, isGrounded, templateAnswer } from "./answer";
import { retrieveDocs } from "./retrieve";

const intent = (over: Partial<Intent>): Intent => ({
  scenario: "investimento", entries: [], tickers: [], months: null, searchTerm: null, goals: [], amount: null, incomeChangePct: null, proposedAllocation: [], missing: [], source: "mock", ...over,
});
const PETR4: Quote = { symbol: "PETR4", name: "Petroleo Brasileiro SA Pfd", price: 5299, changePct: 0.38, currency: "BRL", updatedAt: null, logoUrl: null };
const quotes = async (s: string) => {
  if (s === "PETR4") return PETR4;
  throw new Error("ativo não encontrado");
};
const withRate: FinancialState = { ...DEMO_STATE, investment: { annualRateBps: 1200, label: "CDI do meu banco" } };
const NOW = new Date("2026-10-28T12:00:00Z");

describe("recuperação", () => {
  it("cotação + cotas que cabem no valor", async () => {
    const { docs, errors } = await retrieveDocs(intent({ tickers: ["PETR4"], amount: 20000 }), DEMO_STATE, { month: "2026-10", now: NOW, fetchQuote: quotes });
    expect(errors).toEqual([]);
    const market = docs.filter((d) => !d.id.startsWith("motor:trilha"));
    expect(market.map((d) => d.id)).toEqual(["brapi:PETR4", "motor:cotas-PETR4"]);
    expect(market[0]!.text).toContain("R$ 52,99");
    expect(market[0]!.text).toContain("+0,38%");
    expect(market[1]!.text).toContain("3 cota(s)");
    expect(market[1]!.text).toContain("sobrando R$ 41,03");
  });

  it("erro da Brapi vira aviso, sem derrubar os outros ativos", async () => {
    const { docs, errors } = await retrieveDocs(intent({ tickers: ["PETR4", "ABCD3"] }), DEMO_STATE, { month: "2026-10", fetchQuote: quotes });
    expect(docs.filter((d) => d.source === "brapi")).toHaveLength(1);
    expect(errors[0]).toContain("ABCD3");
  });

  it("projeção usa a taxa informada pelo usuário e o motor", async () => {
    const { docs } = await retrieveDocs(intent({ amount: 100000, months: 2 }), withRate, { month: "2026-10", fetchQuote: quotes });
    const p = docs.find((d) => d.id === "motor:projecao")!;
    expect(p.text).toContain("12,00% ao ano");
    expect(p.text).toContain("R$ 2.028,56"); // mesmo valor do teste do motor (202856 centavos)
    expect(p.text).toContain("CDI do meu banco");
  });

  it("sem taxa cadastrada não inventa rendimento", async () => {
    const { docs } = await retrieveDocs(intent({ amount: 20000, months: 12 }), DEMO_STATE, { month: "2026-10", fetchQuote: quotes });
    expect(docs.filter((d) => !d.id.startsWith("motor:trilha")).map((d) => d.id)).toEqual(["motor:sem-taxa"]);
  });

  it("orçamento do usuário só entra com permissão", async () => {
    const sem = await retrieveDocs(intent({}), DEMO_STATE, { month: "2026-10", fetchQuote: quotes });
    const com = await retrieveDocs(intent({}), DEMO_STATE, { month: "2026-10", fetchQuote: quotes, includeBudget: true });
    expect(sem.docs.some((d) => d.id === "motor:disponivel")).toBe(false);
    expect(com.docs.find((d) => d.id === "motor:disponivel")!.text).toContain("R$ 600,00");
  });
});

describe("geração com checagem de números", () => {
  const docs = [
    { id: "brapi:PETR4", source: "brapi" as const, title: "PETR4", text: "PETR4: preço R$ 52,99, variação no dia de +0,38%.", url: null, fetchedAt: "" },
    { id: "motor:x", source: "motor" as const, title: "x", text: "saldo projetado é R$ 1.234,56 em 12 meses.", url: null, fetchedAt: "" },
  ];

  it("aceita números copiados dos documentos (inclusive sem separador de milhar)", () => {
    expect(isGrounded("A PETR4 está em R$ 52,99 (+0,38%) e o saldo seria R$ 1234,56 em 12 meses.", docs)).toBe(true);
  });

  it("rejeita número inventado ou calculado pelo modelo", () => {
    expect(isGrounded("A PETR4 subiu 5% e vale R$ 60,00.", docs)).toBe(false);
    expect(isGrounded("Em 24 meses o saldo dobra.", docs)).toBe(false);
  });

  it("ignora dígitos de tickers", () => {
    expect(isGrounded("Sobre PETR4 e MXRF11: preço R$ 52,99.", docs)).toBe(true);
  });

  const gemma = (answer: string, citations: string[] = ["brapi:PETR4"]): typeof fetch =>
    (async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "", thought: true }, { text: JSON.stringify({ answer, citations }) }] } }] }), { status: 200 })) as typeof fetch;

  it("resposta fundamentada do Gemma é usada, com aviso e citações válidas", async () => {
    const r = await answerWithDocs("como está PETR4?", docs, { mode: "api", fetchImpl: gemma("A PETR4 está em R$ 52,99 [brapi:PETR4].", ["brapi:PETR4", "inexistente"]) });
    expect(r.source).toBe("api");
    expect(r.citations).toEqual(["brapi:PETR4"]);
    expect(r.answer).toContain("não é recomendação");
  });

  it("resposta com número inventado é trocada pelo texto dos documentos", async () => {
    const r = await answerWithDocs("como está PETR4?", docs, { mode: "api", fetchImpl: gemma("A PETR4 vai a R$ 70,00.") });
    expect(r.source).toBe("mock");
    expect(r.answer).toContain("R$ 52,99");
    expect(r.answer).not.toContain("70,00");
  });

  it("falha de rede ou modo mock usam o texto dos documentos", async () => {
    const fail = (async () => { throw new Error("rede"); }) as typeof fetch;
    expect((await answerWithDocs("x", docs, { mode: "api", fetchImpl: fail })).source).toBe("mock");
    expect((await answerWithDocs("x", docs, { mode: "mock" })).answer).toContain("R$ 52,99");
  });

  it("sem documentos, orienta o usuário", () => {
    expect(templateAnswer([]).answer).toContain("Cite um ativo");
  });
});
