import { describe, expect, it } from "vitest";
import { emptyEntryForm, sortEntries, validateEntryForm } from "./form";
import type { Entry } from "../../contracts/types";
import { CATEGORY_SLUGS } from "../../contracts/import-format";

describe("emptyEntryForm", () => {
  it("retorna formulário vazio com defaults corretos", () => {
    const form = emptyEntryForm("2026-10-15");
    expect(form).toEqual({
      date: "2026-10-15",
      description: "",
      amount: "",
      type: "despesa",
      categorySlug: "mercado",
    });
  });
});

describe("validateEntryForm", () => {
  const existingIds = ["id-1", "id-2"];
  let idCounter = 0;
  const newId = () => `gen-${++idCounter}`;

  it("valida formulário correto", () => {
    const form = {
      date: "2026-10-15",
      description: "  Supermercado  ",
      amount: "45,50",
      type: "despesa" as const,
      categorySlug: "mercado",
    };
    const result = validateEntryForm(form, existingIds, newId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.id).toBe("gen-1");
      expect(result.entry.date).toBe("2026-10-15");
      expect(result.entry.description).toBe("Supermercado");
      expect(result.entry.amount).toBe(4550);
      expect(result.entry.type).toBe("despesa");
      expect(result.entry.categorySlug).toBe("mercado");
      expect(result.entry.source).toBe("manual");
    }
  });

  it("rejeita descrição vazia", () => {
    const form = {
      date: "2026-10-15",
      description: "   ",
      amount: "45,50",
      type: "despesa" as const,
      categorySlug: "mercado",
    };
    const result = validateEntryForm(form, existingIds, newId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.description).toBeDefined();
  });

  it("rejeita descrição muito longa", () => {
    const form = {
      date: "2026-10-15",
      description: "a".repeat(91),
      amount: "45,50",
      type: "despesa" as const,
      categorySlug: "mercado",
    };
    const result = validateEntryForm(form, existingIds, newId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.description).toBeDefined();
  });

  it("rejeita valor zero", () => {
    const form = {
      date: "2026-10-15",
      description: "Teste",
      amount: "0",
      type: "despesa" as const,
      categorySlug: "mercado",
    };
    const result = validateEntryForm(form, existingIds, newId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.amount).toBeDefined();
  });

  it("rejeita valor negativo", () => {
    const form = {
      date: "2026-10-15",
      description: "Teste",
      amount: "-5",
      type: "despesa" as const,
      categorySlug: "mercado",
    };
    const result = validateEntryForm(form, existingIds, newId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.amount).toBeDefined();
  });

  it("rejeita valor não numérico", () => {
    const form = {
      date: "2026-10-15",
      description: "Teste",
      amount: "abc",
      type: "despesa" as const,
      categorySlug: "mercado",
    };
    const result = validateEntryForm(form, existingIds, newId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.amount).toBeDefined();
  });

  it("rejeita data inválida (dia inexistente)", () => {
    const form = {
      date: "2026-02-30",
      description: "Teste",
      amount: "45,50",
      type: "despesa" as const,
      categorySlug: "mercado",
    };
    const result = validateEntryForm(form, existingIds, newId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.date).toBeDefined();
  });

  it("rejeita data inválida (mês inválido)", () => {
    const form = {
      date: "2026-13-01",
      description: "Teste",
      amount: "45,50",
      type: "despesa" as const,
      categorySlug: "mercado",
    };
    const result = validateEntryForm(form, existingIds, newId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.date).toBeDefined();
  });

  it("rejeita categoria inválida", () => {
    const form = {
      date: "2026-10-15",
      description: "Teste",
      amount: "45,50",
      type: "despesa" as const,
      categorySlug: "inexistente",
    };
    const result = validateEntryForm(form, existingIds, newId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.categorySlug).toBeDefined();
  });

  it("aceita todas as categorias válidas", () => {
    for (const slug of CATEGORY_SLUGS) {
      const form = {
        date: "2026-10-15",
        description: "Teste",
        amount: "45,50",
        type: "despesa" as const,
        categorySlug: slug,
      };
      const result = validateEntryForm(form, existingIds, newId);
      expect(result.ok).toBe(true);
    }
  });

  it("rejeita tipo inválido", () => {
    const form = {
      date: "2026-10-15",
      description: "Teste",
      amount: "45,50",
      type: "invalido" as any,
      categorySlug: "mercado",
    };
    const result = validateEntryForm(form, existingIds, newId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.type).toBeDefined();
  });

  it("gera id único se houver colisão", () => {
    const collidingIds = ["gen-1", "gen-2"];
    const form = {
      date: "2026-10-15",
      description: "Teste",
      amount: "45,50",
      type: "despesa" as const,
      categorySlug: "mercado",
    };
    let counter = 0;
    const newIdCollision = () => `gen-${++counter}`;
    const result = validateEntryForm(form, collidingIds, newIdCollision);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.id).toBe("gen-3");
    }
  });

  it("aceita tipo receita", () => {
    const form = {
      date: "2026-10-15",
      description: "Freelance",
      amount: "500,00",
      type: "receita" as const,
      categorySlug: "salario",
    };
    const result = validateEntryForm(form, existingIds, newId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.type).toBe("receita");
      expect(result.entry.amount).toBe(50000);
    }
  });
});

describe("sortEntries", () => {
  it("ordena por data decrescente, depois id decrescente", () => {
    const entries: Entry[] = [
      { id: "a", date: "2026-10-10", description: "A", amount: 1000, type: "despesa", categorySlug: "mercado", source: "manual" },
      { id: "b", date: "2026-10-15", description: "B", amount: 2000, type: "despesa", categorySlug: "mercado", source: "manual" },
      { id: "c", date: "2026-10-15", description: "C", amount: 3000, type: "despesa", categorySlug: "mercado", source: "manual" },
      { id: "d", date: "2026-10-01", description: "D", amount: 4000, type: "despesa", categorySlug: "mercado", source: "manual" },
    ];
    const sorted = sortEntries(entries);
    expect(sorted.map((e) => e.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("não muta o array original", () => {
    const entries: Entry[] = [
      { id: "a", date: "2026-10-10", description: "A", amount: 1000, type: "despesa", categorySlug: "mercado", source: "manual" },
      { id: "b", date: "2026-10-15", description: "B", amount: 2000, type: "despesa", categorySlug: "mercado", source: "manual" },
    ];
    const originalOrder = [...entries];
    sortEntries(entries);
    expect(entries.map((e) => e.id)).toEqual(originalOrder.map((e) => e.id));
  });

  it("retorna array vazio para entrada vazia", () => {
    expect(sortEntries([])).toEqual([]);
  });
});