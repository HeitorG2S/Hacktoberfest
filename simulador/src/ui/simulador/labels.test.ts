import { describe, expect, it } from "vitest";
import { SCENARIO_LABEL, PRIORITY_LABEL, scenarioLabel, priorityLabel } from "./labels";
import type { ScenarioType, Priority } from "../../contracts/types";

describe("labels", () => {
  it("SCENARIO_LABEL cobre todos os ScenarioType de contracts/llm-schema.ts", () => {
    const SCENARIOS: ScenarioType[] = [
      "alocar_metas",
      "compra",
      "meta_com_prazo",
      "despesa_inesperada",
      "divida_vs_reserva",
      "perda_renda",
      "desconhecido",
    ];

    for (const s of SCENARIOS) {
      expect(SCENARIO_LABEL[s]).toBeDefined();
      expect(typeof SCENARIO_LABEL[s]).toBe("string");
      expect(SCENARIO_LABEL[s].length).toBeGreaterThan(0);
    }
  });

  it("PRIORITY_LABEL cobre todos os Priority", () => {
    const PRIORITIES: Priority[] = ["alta", "media", "baixa"];

    for (const p of PRIORITIES) {
      expect(PRIORITY_LABEL[p]).toBeDefined();
      expect(typeof PRIORITY_LABEL[p]).toBe("string");
      expect(PRIORITY_LABEL[p].length).toBeGreaterThan(0);
    }
  });

  it("scenarioLabel devolve o rótulo correto", () => {
    expect(scenarioLabel("alocar_metas")).toBe("Dividir entre metas");
    expect(scenarioLabel("compra")).toBe("Compra única");
    expect(scenarioLabel("meta_com_prazo")).toBe("Meta com prazo");
    expect(scenarioLabel("despesa_inesperada")).toBe("Despesa inesperada");
    expect(scenarioLabel("divida_vs_reserva")).toBe("Dívida vs. reserva");
    expect(scenarioLabel("perda_renda")).toBe("Perda de renda");
    expect(scenarioLabel("desconhecido")).toBe("Não identificado");
  });

  it("priorityLabel devolve o rótulo correto", () => {
    expect(priorityLabel("alta")).toBe("Alta");
    expect(priorityLabel("media")).toBe("Média");
    expect(priorityLabel("baixa")).toBe("Baixa");
  });
});