import type { ImportResult, ImportIssue, FinancialState, Budget, Cents } from "../../contracts/types";
import { parseMoney, MoneyError, sum } from "../../engine/money";
import { CSV_COLUMNS } from "../../contracts/import-format";
import { normalizeCategory, normalizeDescription, makeDedupeKey, parseAmount, getBucketForTransaction, validateReferenceMonth, normalizeRecurring, normalizeType } from "./normalize";

export function importCsv(raw: string, referenceMonth?: string): ImportResult {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("CSV vazio ou sem linhas de dados");
  }

  const header = lines[0]!.split(";");
  const expectedHeader = [...CSV_COLUMNS];
  if (header.length !== expectedHeader.length || header.some((h, i) => h.trim() !== expectedHeader[i])) {
    throw new Error(`Cabeçalho CSV inválido. Esperado: ${expectedHeader.join(";")}, recebido: ${header.join(";")}`);
  }

  const rejected: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const acceptedTransactions: Array<{
    id: string;
    date: string;
    amount: Cents;
    type: "CREDIT" | "DEBIT";
    categorySlug: "salario" | "moradia" | "contas" | "mercado" | "transporte" | "saude" | "educacao" | "divida" | "lazer" | "outros";
    recurring: boolean;
    description: string;
  }> = [];
  const seenKeys = new Map<string, string>();
  let duplicates = 0;
  const monthCounts = new Map<string, number>();

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!.trim();
    if (!line) continue;

    const cols = line.split(";");
    if (cols.length !== expectedHeader.length) {
      rejected.push({ ref: `linha ${lineIdx + 1}`, reason: `número de colunas inválido (esperado ${expectedHeader.length}, recebido ${cols.length})` });
      continue;
    }

    const date = cols[0]?.trim() ?? "";
    const description = cols[1]?.trim() ?? "";
    const amountText = cols[2]?.trim() ?? "";
    const typeText = cols[3]?.trim() ?? "";
    const categorySlug = cols[4]?.trim() ?? "";
    const recurringText = cols[5]?.trim() ?? "";
    const ref = `linha ${lineIdx + 1}`;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      rejected.push({ ref, reason: `data inválida: "${date}"` });
      continue;
    }

    const type = normalizeType(typeText);
    if (!type) {
      rejected.push({ ref, reason: `tipo inválido ou ausente: "${typeText}"` });
      continue;
    }

    let amountCents: Cents;
    try {
      amountCents = parseAmount(amountText);
    } catch {
      rejected.push({ ref, reason: `valor inválido: "${amountText}"` });
      continue;
    }
    // Como no JSON, o valor é sempre positivo; o sentido vem de `type` (estorno negativo distorceria os totais).
    if (amountCents <= 0) {
      rejected.push({ ref, reason: `valor deve ser positivo (o sentido vem do tipo CREDIT/DEBIT): "${amountText}"` });
      continue;
    }

    const catResult = normalizeCategory(categorySlug);
    if (catResult.warning) warnings.push({ ref, reason: catResult.warning });

    const recurring = normalizeRecurring(recurringText);

    const month = date.slice(0, 7);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);

    const key = makeDedupeKey(date, amountCents, description);
    if (seenKeys.has(key)) {
      duplicates++;
      warnings.push({ ref, reason: `duplicada de ${seenKeys.get(key)}` });
      continue;
    }
    seenKeys.set(key, ref);

    acceptedTransactions.push({
      id: `txn_${acceptedTransactions.length}`,
      date,
      amount: amountCents,
      type,
      categorySlug: catResult.slug,
      recurring,
      description,
    });
  }

  const refMonth = referenceMonth ?? (() => {
    let maxCount = 0;
    let maxMonth = "";
    for (const [month, count] of monthCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxMonth = month;
      }
    }
    return maxMonth;
  })();

  const filteredTransactions = [];
  for (const t of acceptedTransactions) {
    if (!validateReferenceMonth(t.date, refMonth)) {
      rejected.push({ ref: t.id, reason: `fora do mês de referência ${refMonth}` });
      continue;
    }
    filteredTransactions.push(t);
  }

  let income = 0;
  let fixed = 0;
  let variableEssential = 0;
  let debtMinimums = 0;

  for (const t of filteredTransactions) {
    const bucket = getBucketForTransaction(t.categorySlug, t.recurring, t.type);

    if (t.type === "CREDIT") {
      if (bucket === "income") {
        income += t.amount;
      } else {
        warnings.push({ ref: t.id, reason: `crédito em categoria não-renda (${t.categorySlug}) ignorado no orçamento` });
      }
    } else {
      if (bucket === "debt") {
        debtMinimums += t.amount;
      } else if (bucket === "fixed") {
        fixed += t.amount;
      } else if (bucket === "variableEssential") {
        variableEssential += t.amount;
      } else if (bucket === "ignorar") {
      }
    }
  }

  if (debtMinimums > 0) {
    warnings.push({ ref: "dívidas", reason: "mínimo de dívida estimado pelos pagamentos do mês" });
  }

  const budget: Budget = { income, fixed, variableEssential, debtMinimums };

  const state: FinancialState = {
    budget,
    goals: [],
    debts: [],
    reserveBalance: 0,
    entries: [],
  };

  return {
    state,
    summary: {
      accepted: filteredTransactions.length,
      rejected,
      duplicates,
      warnings,
      totals: budget,
    },
  };
}