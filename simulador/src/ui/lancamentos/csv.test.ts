import { describe, expect, it } from "vitest";
import { entriesToCsv, formatShortDate } from "./csv";
import type { Entry } from "../../contracts/types";

function parseCsv(csv: string): string[][] {
  const result: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ";" && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      currentRow.push(currentField);
      result.push(currentRow);
      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    result.push(currentRow);
  }

  return result;
}

describe("formatShortDate", () => {
  it("formata data AAAA-MM-DD para dd de mmm", () => {
    expect(formatShortDate("2026-10-28")).toBe("28 de out");
    expect(formatShortDate("2026-01-01")).toBe("1 de jan");
    expect(formatShortDate("2026-12-31")).toBe("31 de dez");
    expect(formatShortDate("2026-02-05")).toBe("5 de fev");
    expect(formatShortDate("2026-09-09")).toBe("9 de set");
  });
});

describe("entriesToCsv", () => {
  const entries: Entry[] = [
    {
      id: "1",
      date: "2026-10-28",
      description: "Supermercado",
      amount: 4590,
      type: "despesa",
      categorySlug: "mercado",
      source: "manual",
    },
    {
      id: "2",
      date: "2026-10-29",
      description: "Freelance; pagamento",
      amount: 50000,
      type: "receita",
      categorySlug: "salario",
      source: "agente",
    },
    {
      id: "3",
      date: "2026-10-30",
      description: "Aluguel\ncom quebra de linha",
      amount: 120000,
      type: "despesa",
      categorySlug: "moradia",
      source: "manual",
    },
  ];

  it("gera cabeçalho exato", () => {
    const csv = entriesToCsv(entries);
    const rows = parseCsv(csv);
    expect(rows[0] ?? []).toEqual(["date", "description", "amount", "type", "categorySlug", "recurring"]);
  });

  it("usa ; como separador", () => {
    const csv = entriesToCsv(entries);
    const rows = parseCsv(csv);
    expect(rows[1]?.length).toBe(6);
  });

  it("formata valor como 45.90 (texto canônico)", () => {
    const csv = entriesToCsv(entries);
    const rows = parseCsv(csv);
    expect(rows[1]?.[2]).toBe("45.90");
    expect(rows[2]?.[2]).toBe("500.00");
    expect(rows[3]?.[2]).toBe("1200.00");
  });

  it("escapa ; na descrição com aspas", () => {
    const csv = entriesToCsv(entries);
    const rows = parseCsv(csv);
    expect(rows[2]?.[1]).toBe("Freelance; pagamento");
  });

  it("escapa quebra de linha na descrição com aspas", () => {
    const csv = entriesToCsv(entries);
    const rows = parseCsv(csv);
    expect(rows[3]?.[1]).toBe("Aluguel\ncom quebra de linha");
  });

  it("formata data como AAAA-MM-DD", () => {
    const csv = entriesToCsv(entries);
    const rows = parseCsv(csv);
    expect(rows[1]?.[0]).toBe("2026-10-28");
  });

  it("inclui recurring como false", () => {
    const csv = entriesToCsv(entries);
    const rows = parseCsv(csv);
    expect(rows[1]?.[5]).toBe("false");
  });

  it("array vazio retorna só cabeçalho", () => {
    const csv = entriesToCsv([]);
    const rows = parseCsv(csv);
    expect(rows).toEqual([["date", "description", "amount", "type", "categorySlug", "recurring"]]);
  });
});
import { importStatement } from "../../adapters/extrato";

describe("exportação reimportável", () => {
  it("o CSV exportado é aceito pela importação com os mesmos valores", () => {
    const csv = entriesToCsv([
      { id: "1", date: "2026-10-03", description: "Mercado", amount: 4590, type: "despesa", categorySlug: "mercado", source: "manual" },
      { id: "2", date: "2026-10-04", description: "Freela", amount: 30000, type: "receita", categorySlug: "salario", source: "agente" },
    ]);
    const r = importStatement(csv, "csv");
    expect(r.summary.rejected).toEqual([]);
    expect(r.state.budget.variableEssential).toBe(4590);
    expect(r.state.budget.income).toBe(30000);
  });
});
