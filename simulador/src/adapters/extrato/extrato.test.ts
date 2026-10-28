import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { importStatement } from "./index";
import { DEMO_STATE } from "../../demo";
import type { ImportResult, FinancialState } from "../../contracts/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, "fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

function deepEqualState(a: FinancialState, b: FinancialState): boolean {
  return (
    a.budget.income === b.budget.income &&
    a.budget.fixed === b.budget.fixed &&
    a.budget.variableEssential === b.budget.variableEssential &&
    a.budget.debtMinimums === b.budget.debtMinimums &&
    a.reserveBalance === b.reserveBalance &&
    a.goals.length === b.goals.length &&
    a.debts.length === b.debts.length &&
    a.goals.every((g, i) => {
      const bg = b.goals[i];
      return bg && g.id === bg.id && g.name === bg.name && g.target === bg.target && g.saved === bg.saved && g.deadlineMonths === bg.deadlineMonths && g.priority === bg.priority;
    }) &&
    a.debts.every((d, i) => {
      const bd = b.debts[i];
      return bd && d.id === bd.id && d.name === bd.name && d.balance === bd.balance && d.minPayment === bd.minPayment && d.monthlyRateBps === bd.monthlyRateBps;
    })
  );
}

describe("importStatement - JSON", () => {
  it("demo.json → state deep-equal a DEMO_STATE e rejected vazio", () => {
    const raw = loadFixture("demo.json");
    const result = importStatement(raw, "json");

    expect(deepEqualState(result.state, DEMO_STATE)).toBe(true);
    expect(result.summary.rejected).toEqual([]);
    expect(result.summary.accepted).toBe(7); // 7 transações válidas (inclui lazer que é "ignorar" mas aceita)
  });

  it("problemas.json → cada problema aparece com motivo esperado; duplicates = 2; accepted = 2; meta e dívida inválidas não entram", () => {
    const raw = loadFixture("problemas.json");
    const result = importStatement(raw, "json");

    // Verifica accepted = 2 (válida + categoria desconhecida que vira "outros")
    expect(result.summary.accepted).toBe(2);

    // Verifica duplicates = 2 (uma por ID, uma por chave composta)
    expect(result.summary.duplicates).toBe(2);

// Verifica rejected reasons
    const rejectedReasons = result.summary.rejected.map(r => r.reason).sort();
    expect(rejectedReasons.some(r => r.includes("valor inválido") || r.includes("schema inválido"))).toBe(true);
    expect(rejectedReasons).toContain("fora do mês de referência 2026-10");
    expect(rejectedReasons).toContain("pendente, não compõe o orçamento");
    expect(rejectedReasons.some(r => r.includes("tipo inválido") || r.includes("schema inválido"))).toBe(true);
    expect(rejectedReasons.some(r => r.includes("minPayment maior que o saldo"))).toBe(true);
    expect(rejectedReasons.some(r => r.includes("target deve ser > 0"))).toBe(true);

    // Verifica warnings
    const warningReasons = result.summary.warnings.map(w => w.reason).sort();
    expect(warningReasons.some(w => w.includes("categoria desconhecida 'investimento' tratada como outros"))).toBe(true);
    expect(warningReasons.some(w => w.includes("duplicada"))).toBe(true);

    // Meta e dívida inválidas não entram
    expect(result.state.goals).toHaveLength(0);
    expect(result.state.debts).toHaveLength(0);
  });

  it("envelope: JSON quebrado lança Error", () => {
    expect(() => importStatement("{invalid json", "json")).toThrow("JSON quebrado");
  });

  it("envelope: format errado lança Error", () => {
    const raw = JSON.stringify({ format: "outro/v1", currency: "BRL", referenceMonth: "2026-10", accounts: [], transactions: [], debts: [], goals: [] });
    expect(() => importStatement(raw, "json")).toThrow("Formato não suportado");
  });

  it("envelope: moeda USD lança Error", () => {
    const raw = JSON.stringify({ format: "simfin-import/v1", currency: "USD", referenceMonth: "2026-10", accounts: [], transactions: [], debts: [], goals: [] });
    expect(() => importStatement(raw, "json")).toThrow("Moeda não suportada");
  });
});

describe("importStatement - CSV", () => {
  it("demo.csv → budget igual a DEMO_STATE.budget", () => {
    const raw = loadFixture("demo.csv");
    const result = importStatement(raw, "csv");

    expect(result.state.budget.income).toBe(DEMO_STATE.budget.income);
    expect(result.state.budget.fixed).toBe(DEMO_STATE.budget.fixed);
    expect(result.state.budget.variableEssential).toBe(DEMO_STATE.budget.variableEssential);
    expect(result.state.budget.debtMinimums).toBe(DEMO_STATE.budget.debtMinimums);
  });

  it("CSV com \"1.234,56\" vira 123456 centavos", () => {
    const csv = `date;description;amount;type;categorySlug;recurring
2026-10-01;Teste;1.234,56;CREDIT;salario;false`;
    const result = importStatement(csv, "csv");
    expect(result.state.budget.income).toBe(123456);
  });

  it("envelope: CSV com cabeçalho errado lança Error", () => {
    const csv = `date;description;amount;type
2026-10-01;Teste;100.00;CREDIT`;
    expect(() => importStatement(csv, "csv")).toThrow("Cabeçalho CSV inválido");
  });

  it("CSV vazio lança Error", () => {
    expect(() => importStatement("", "csv")).toThrow("CSV vazio ou sem linhas de dados");
  });

  it("CSV só com cabeçalho lança Error", () => {
    const csv = "date;description;amount;type;categorySlug;recurring";
    expect(() => importStatement(csv, "csv")).toThrow("CSV vazio ou sem linhas de dados");
  });
});

describe("importStatement - referenceMonth override", () => {
  it("opts.referenceMonth sobrescreve o do arquivo", () => {
    const raw = loadFixture("demo.json");
    const result = importStatement(raw, "json", { referenceMonth: "2026-09" });
    // Todas as transações são de 2026-10, então todas devem ser rejeitadas por mês errado
    expect(result.summary.accepted).toBe(0);
    expect(result.summary.rejected.length).toBe(7);
    expect(result.summary.rejected.every(r => r.reason.includes("fora do mês de referência 2026-09"))).toBe(true);
  });
});

describe("achados da review", () => {
  it("CSV rejeita valor negativo ou zero", () => {
    const csv = "date;description;amount;type;categorySlug;recurring\n2026-10-03;Estorno;-120,00;DEBIT;mercado;\n2026-10-03;Zero;0,00;DEBIT;mercado;\n2026-10-04;Feira;10,00;DEBIT;mercado;";
    const r = importStatement(csv, "csv");
    expect(r.summary.accepted).toBe(1);
    expect(r.summary.rejected.map((x) => x.reason).every((m) => m.includes("positivo"))).toBe(true);
    expect(r.state.budget.variableEssential).toBe(1000);
  });

  it("pagamento de dívida recorrente não conta em fixas nem duas vezes", () => {
    const json = JSON.stringify({
      format: "simfin-import/v1", currency: "BRL", referenceMonth: "2026-10",
      transactions: [{ id: "t1", date: "2026-10-05", description: "Cartão", amount: "250.00", type: "DEBIT", categorySlug: "divida", recurring: true }],
      debts: [{ id: "cartao", name: "Cartão", balance: "3000.00", minPayment: "250.00", monthlyRateBps: 1200 }],
    });
    const r = importStatement(json, "json");
    expect(r.state.budget.fixed).toBe(0);
    expect(r.state.budget.debtMinimums).toBe(25000);
  });
});

