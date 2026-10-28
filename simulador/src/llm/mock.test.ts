import { describe, it, expect } from "vitest";
import { mockInterpret } from "./mock";

describe("mockInterpret", () => {
  it("exemplo 1: computador em 6 meses -> meta_com_prazo com amount 180000 e deadlineMonths 6", () => {
    const text = "Quero comprar um computador de R$ 1.800 em seis meses, sem deixar de guardar dinheiro";
    const intent = mockInterpret(text);
    expect(intent.scenario).toBe("meta_com_prazo");
    expect(intent.goals).toHaveLength(1);
    expect(intent.goals[0]?.name).toBe("computador");
    expect(intent.goals[0]?.amount).toBe(180000);
    expect(intent.goals[0]?.deadlineMonths).toBe(6);
    expect(intent.goals[0]?.priority).toBeNull();
    expect(intent.amount).toBeNull();
    expect(intent.incomeChangePct).toBeNull();
    expect(intent.proposedAllocation).toEqual([]);
    expect(intent.missing).toEqual([]);
    expect(intent.source).toBe("mock");
  });

  it("exemplo 2: três metas -> alocar_metas sem plano inventado pelo mock", () => {
    const text = "Quero guardar dinheiro para emergências, comprar um computador e ainda ter um pouco para lazer. Encontre uma divisão equilibrada sem ultrapassar o que tenho disponível.";
    const intent = mockInterpret(text);
    expect(intent.scenario).toBe("alocar_metas");
    expect(intent.goals.map((g) => g.name).sort()).toEqual(["computador", "lazer", "reserva"]);
    expect(intent.goals.every((g) => g.amount === null)).toBe(true);
    expect(intent.proposedAllocation).toEqual([]);
    expect(intent.source).toBe("mock");
  });

  it("registrar gasto: valor, categoria e descrição", () => {
    const i = mockInterpret("Gastei R$ 45,90 no mercado hoje");
    expect(i.scenario).toBe("registrar_gasto");
    expect(i.entries).toEqual([{ description: "Mercado", amount: 4590, type: "despesa", categorySlug: "mercado", date: null }]);
  });

  it("vários lançamentos numa frase", () => {
    const i = mockInterpret("Gastei 45,90 no mercado e 40 reais no cinema hoje");
    expect(i.entries.map((e) => [e.description, e.amount, e.categorySlug])).toEqual([
      ["Mercado", 4590, "mercado"],
      ["Cinema", 4000, "lazer"],
    ]);
  });

  it("registrar receita extra", () => {
    const i = mockInterpret("Recebi 300 reais de um freela");
    expect(i.scenario).toBe("registrar_gasto");
    expect(i.entries[0]).toMatchObject({ amount: 30000, type: "receita" });
  });

  it("verbo no passado sem valor não registra nada", () => {
    expect(mockInterpret("Paguei a conta de luz").scenario).not.toBe("registrar_gasto");
  });

  it("investimento com tickers, valor e prazo", () => {
    const i = mockInterpret("Quanto rende investir R$ 200 por mês em 12 meses? E como está PETR4 e mxrf11?");
    expect(i.scenario).toBe("investimento");
    expect(i.tickers).toEqual(["PETR4", "MXRF11"]);
    expect(i.amount).toBe(20000);
    expect(i.months).toBe(12);
  });

  it("perda de 30% da renda -> perda_renda com incomeChangePct -30", () => {
    const text = "E se eu perder 30% da minha renda?";
    const intent = mockInterpret(text);
    expect(intent.scenario).toBe("perda_renda");
    expect(intent.incomeChangePct).toBe(-30);
    expect(intent.goals).toEqual([]);
    expect(intent.amount).toBeNull();
    expect(intent.source).toBe("mock");
  });

  it("despesa inesperada com valor", () => {
    const text = "Tive uma despesa inesperada de R$ 500";
    const intent = mockInterpret(text);
    expect(intent.scenario).toBe("despesa_inesperada");
    expect(intent.amount).toBe(50000);
  });

  it("divida vs reserva", () => {
    const text = "Devo pagar a divida ou guardar na reserva?";
    const intent = mockInterpret(text);
    expect(intent.scenario).toBe("divida_vs_reserva");
  });

  it("compra sem prazo", () => {
    const text = "Quero comprar um celular de 1200 reais";
    const intent = mockInterpret(text);
    expect(intent.scenario).toBe("compra");
    expect(intent.amount).toBe(120000);
    expect(intent.goals[0]?.name).toBe("celular");
  });

  it("desconhecido para frase não reconhecida", () => {
    const text = "Olá, como vai?";
    const intent = mockInterpret(text);
    expect(intent.scenario).toBe("desconhecido");
    expect(intent.missing).toContain("scenario");
  });

  it("valor '2 mil' -> 200000 centavos", () => {
    const text = "Quero comprar uma moto de 2 mil em 12 meses";
    const intent = mockInterpret(text);
    expect(intent.scenario).toBe("meta_com_prazo");
    expect(intent.goals[0]?.amount).toBe(200000);
    expect(intent.goals[0]?.deadlineMonths).toBe(12);
  });

  it("número por extenso para deadline", () => {
    const text = "Quero comprar uma bike de 1000 em doze meses";
    const intent = mockInterpret(text);
    expect(intent.goals[0]?.deadlineMonths).toBe(12);
  });

  it("ignora acentos e caixa", () => {
    const text = "PERDER 20% DA RENDA";
    const intent = mockInterpret(text);
    expect(intent.scenario).toBe("perda_renda");
    expect(intent.incomeChangePct).toBe(-20);
  });
});