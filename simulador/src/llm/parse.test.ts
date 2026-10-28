import { describe, it, expect } from "vitest";
import { extractJson, parseLlmText, toIntent } from "./parse";
import type { RawIntent } from "../contracts/llm-schema";

describe("extractJson", () => {
  it("extrai JSON dentro de cercas ```json", () => {
    const text = '```json\n{"scenario": "compra", "goals": []}\n```';
    const result = extractJson(text);
    expect(result).toEqual({ scenario: "compra", goals: [] });
  });

  it("extrai JSON dentro de cercas ``` sem linguagem", () => {
    const text = '```\n{"scenario": "compra", "goals": []}\n```';
    const result = extractJson(text);
    expect(result).toEqual({ scenario: "compra", goals: [] });
  });

  it("extrai JSON com texto antes e depois", () => {
    const text = 'Aqui está o resultado:\n{"scenario": "compra", "goals": []}\nFim.';
    const result = extractJson(text);
    expect(result).toEqual({ scenario: "compra", "goals": [] });
  });

  it("extrai o primeiro objeto balanceado quando há múltiplos", () => {
    const text = '{"a": 1} {"b": 2}';
    const result = extractJson(text);
    expect(result).toEqual({ a: 1 });
  });

  it("lança erro quando não há JSON", () => {
    expect(() => extractJson("sem json aqui")).toThrow("Nenhum objeto JSON encontrado");
  });

  it("lança erro quando JSON está malformado", () => {
    expect(() => extractJson("{malformado")).toThrow("Nenhum objeto JSON encontrado");
  });
});

describe("parseLlmText", () => {
  const validRaw: RawIntent = {
    scenario: "compra",
    goals: [{ name: "notebook", amount: "1800.00", deadline_months: null, priority: "alta" }],
    amount: "1800.00",
    income_change_pct: null,
    proposed_allocation: [],
    missing: [],
    entries: [],
    tickers: [],
    months: null,
    search_term: null,
  };

  it("retorna ok:true para JSON válido", () => {
    const text = JSON.stringify(validRaw);
    const result = parseLlmText(text, "api");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.scenario).toBe("compra");
      expect(result.intent.goals[0]?.amount).toBe(180000);
      expect(result.intent.source).toBe("api");
    }
  });

  it("retorna ok:false para valor com vírgula (inválido no esquema)", () => {
    const invalidRaw = { ...validRaw, goals: [{ ...validRaw.goals[0], amount: "1800,00" }] };
    const text = JSON.stringify(invalidRaw);
    const result = parseLlmText(text, "api");
    expect(result.ok).toBe(false);
  });

  it("retorna ok:false para cenário fora da lista", () => {
    const invalidRaw = { ...validRaw, scenario: "cenario_invalido" };
    const text = JSON.stringify(invalidRaw);
    const result = parseLlmText(text, "api");
    expect(result.ok).toBe(false);
  });

  it("retorna ok:false para campo extra (strict)", () => {
    const invalidRaw = { ...validRaw, extra_field: "não permitido" };
    const text = JSON.stringify(invalidRaw);
    const result = parseLlmText(text, "api");
    expect(result.ok).toBe(false);
  });

  it("retorna ok:false para JSON malformado", () => {
    const result = parseLlmText("{malformado", "api");
    expect(result.ok).toBe(false);
  });

  it("converte snake_case para camelCase e usa parseMoney", () => {
    const raw: RawIntent = {
      scenario: "meta_com_prazo",
      goals: [{ name: "casa", amount: "250000.50", deadline_months: 12, priority: "media" }],
      amount: null,
      income_change_pct: null,
      proposed_allocation: [],
      missing: [],
      entries: [],
      tickers: [],
      months: null,
      search_term: null,
    };
    const text = JSON.stringify(raw);
    const result = parseLlmText(text, "mock");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.goals[0]?.deadlineMonths).toBe(12);
      expect(result.intent.goals[0]?.priority).toBe("media");
      expect(result.intent.goals[0]?.amount).toBe(25000050);
      expect(result.intent.source).toBe("mock");
    }
  });
});

describe("toIntent", () => {
  it("converte RawIntent para Intent com parseMoney", () => {
    const raw: RawIntent = {
      scenario: "despesa_inesperada",
      goals: [],
      amount: "500.75",
      income_change_pct: null,
      proposed_allocation: [{ goal: "reserva", amount: "300.00" }],
      missing: [],
      entries: [],
      tickers: [],
      months: null,
      search_term: null,
    };
    const intent = toIntent(raw, "api");
    expect(intent.amount).toBe(50075);
    expect(intent.proposedAllocation[0]?.amount).toBe(30000);
    expect(intent.scenario).toBe("despesa_inesperada");
    expect(intent.source).toBe("api");
  });

  it("mapeia cenário desconhecido para 'desconhecido'", () => {
    const raw: RawIntent = {
      scenario: "nao_existe" as "alocar_metas" | "compra" | "meta_com_prazo" | "despesa_inesperada" | "divida_vs_reserva" | "perda_renda" | "desconhecido",
      goals: [],
      amount: null,
      income_change_pct: null,
      proposed_allocation: [],
      missing: [],
      entries: [],
      tickers: [],
      months: null,
      search_term: null,
    };
    const intent = toIntent(raw, "mock");
    expect(intent.scenario).toBe("desconhecido");
  });
});