import { z } from "zod";
import type { ImportResult, ImportIssue, FinancialState, Budget, Goal, Debt, Cents } from "../../contracts/types";
import { parseMoney, MoneyError, sum } from "../../engine/money";
import { ImportFileSchema, AccountSchema, TransactionSchema, DebtSchema, GoalSchema, CATEGORY_SLUGS, CATEGORY_BUCKET, type CategorySlug, type BudgetBucket, IMPORT_FORMAT } from "../../contracts/import-format";
import { normalizeCategory, normalizeDescription, makeDedupeKey, parseAmount, getBucketForTransaction, validateReferenceMonth, normalizeRecurring } from "./normalize";

const LooseEnvelopeSchema = z.object({
  format: z.string(),
  currency: z.string(),
  referenceMonth: z.string().regex(/^\d{4}-\d{2}$/),
  accounts: z.array(z.unknown()).default([]),
  transactions: z.array(z.unknown()).default([]),
  debts: z.array(z.unknown()).default([]),
  goals: z.array(z.unknown()).default([]),
});

export function importJson(raw: string, referenceMonth?: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`JSON quebrado: ${e instanceof Error ? e.message : String(e)}`);
  }

  let envelope: z.infer<typeof LooseEnvelopeSchema>;
  try {
    envelope = LooseEnvelopeSchema.parse(parsed);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const msg = e.errors.map(err => `${err.path.join(".")}: ${err.message}`).join("; ");
      throw new Error(`Envelope JSON inválido: ${msg}`);
    }
    throw new Error(`Envelope JSON inválido: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (envelope.format !== IMPORT_FORMAT) {
    throw new Error(`Formato não suportado: "${envelope.format}". Esperado: "${IMPORT_FORMAT}"`);
  }
  if (envelope.currency !== "BRL") {
    throw new Error(`Moeda não suportada: "${envelope.currency}". Esperado: "BRL"`);
  }

  const refMonth = referenceMonth ?? envelope.referenceMonth;

  const rejected: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const acceptedTransactions: Array<{
    id: string;
    date: string;
    amount: Cents;
    type: "CREDIT" | "DEBIT";
    categorySlug: CategorySlug;
    recurring: boolean;
    description: string;
  }> = [];
  const seenKeys = new Map<string, string>();
  let duplicates = 0;

  for (let i = 0; i < envelope.transactions.length; i++) {
    const tx = envelope.transactions[i];
    const rawId = (tx as Record<string, unknown>).id;
    const ref: string = typeof rawId === "string" && rawId.length > 0 ? rawId : `transação ${i + 1}`;

    const parsedTx = TransactionSchema.safeParse(tx);
    if (!parsedTx.success) {
      rejected.push({ ref, reason: `schema inválido: ${parsedTx.error.errors.map(e => e.message).join(", ")}` });
      continue;
    }

    const t = parsedTx.data;

    if (t.status === "pending") {
      rejected.push({ ref, reason: "pendente, não compõe o orçamento" });
      continue;
    }

    if (!validateReferenceMonth(t.date, refMonth)) {
      rejected.push({ ref, reason: `fora do mês de referência ${refMonth}` });
      continue;
    }

    let amountCents: Cents;
    try {
      amountCents = parseAmount(t.amount);
    } catch {
      rejected.push({ ref, reason: `valor inválido: "${t.amount}"` });
      continue;
    }

    const catResult = normalizeCategory(t.categorySlug);
    if (catResult.warning) warnings.push({ ref, reason: catResult.warning });

    const key = t.id ? `id:${t.id}` : makeDedupeKey(t.date, amountCents, t.description);
    if (seenKeys.has(key)) {
      duplicates++;
      warnings.push({ ref, reason: `duplicada de ${seenKeys.get(key)}` });
      continue;
    }
    seenKeys.set(key, ref);

    acceptedTransactions.push({
      id: t.id ?? `txn_${acceptedTransactions.length}`,
      date: t.date,
      amount: amountCents,
      type: t.type,
      categorySlug: catResult.slug,
      recurring: t.recurring,
      description: t.description,
    });
  }

  let reserveBalance: Cents = 0;
  for (let i = 0; i < envelope.accounts.length; i++) {
    const acc = envelope.accounts[i];
    const ref = `conta ${i + 1}`;
    const parsedAcc = AccountSchema.safeParse(acc);
    if (!parsedAcc.success) {
      rejected.push({ ref, reason: `schema inválido: ${parsedAcc.error.errors.map(e => e.message).join(", ")}` });
      continue;
    }
    const a = parsedAcc.data;
    if (a.subtype === "SAVINGS_ACCOUNT") {
      try {
        reserveBalance += parseAmount(a.balance);
      } catch {
        rejected.push({ ref, reason: `saldo inválido: "${a.balance}"` });
      }
    }
  }
  if (reserveBalance > 0) {
    warnings.push({ ref: "contas", reason: "reserva assumida como soma dos saldos de contas SAVINGS_ACCOUNT" });
  }

  const debts: Debt[] = [];
  for (let i = 0; i < envelope.debts.length; i++) {
    const d = envelope.debts[i];
    const ref = `dívida ${i + 1}`;
    const parsedDebt = DebtSchema.safeParse(d);
    if (!parsedDebt.success) {
      rejected.push({ ref, reason: `schema inválido: ${parsedDebt.error.errors.map(e => e.message).join(", ")}` });
      continue;
    }
    const debt = parsedDebt.data;
    try {
      const balance = parseAmount(debt.balance);
      const minPayment = parseAmount(debt.minPayment);
      if (balance < 0) throw new MoneyError("saldo negativo");
      if (minPayment < 0) throw new MoneyError("minPayment negativo");
      if (minPayment > balance) throw new MoneyError("minPayment maior que o saldo");
      if (debt.monthlyRateBps < 0 || debt.monthlyRateBps > 100000) throw new MoneyError("monthlyRateBps fora do intervalo");
      debts.push({ id: debt.id, name: debt.name, balance, minPayment, monthlyRateBps: debt.monthlyRateBps });
    } catch (e) {
      rejected.push({ ref, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  const goals: Goal[] = [];
  for (let i = 0; i < envelope.goals.length; i++) {
    const g = envelope.goals[i];
    const ref = `meta ${i + 1}`;
    const parsedGoal = GoalSchema.safeParse(g);
    if (!parsedGoal.success) {
      rejected.push({ ref, reason: `schema inválido: ${parsedGoal.error.errors.map(e => e.message).join(", ")}` });
      continue;
    }
    const goal = parsedGoal.data;
    try {
      const target = parseAmount(goal.target);
      const saved = parseAmount(goal.saved);
      if (target <= 0) throw new MoneyError("target deve ser > 0");
      if (saved < 0) throw new MoneyError("saved não pode ser negativo");
      if (saved > target) throw new MoneyError("saved maior que target");
      if (goal.deadlineMonths !== null && goal.deadlineMonths < 1) throw new MoneyError("deadlineMonths inválido");
      goals.push({ id: goal.id, name: goal.name, target, saved, deadlineMonths: goal.deadlineMonths, priority: goal.priority });
    } catch (e) {
      rejected.push({ ref, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  let income = 0;
  let fixed = 0;
  let variableEssential = 0;
  let debtMinimums = 0;

  for (const t of acceptedTransactions) {
    const bucket = getBucketForTransaction(t.categorySlug, t.recurring, t.type);

    if (t.type === "CREDIT") {
      if (bucket === "income") {
        income += t.amount;
      } else {
        warnings.push({ ref: t.id, reason: `crédito em categoria não-renda (${t.categorySlug}) ignorado no orçamento` });
      }
    } else {
      if (bucket === "debt") {
        if (debts.length === 0) {
          debtMinimums += t.amount;
        }
      } else if (bucket === "fixed") {
        fixed += t.amount;
      } else if (bucket === "variableEssential") {
        variableEssential += t.amount;
      } else if (bucket === "ignorar") {
      }
    }
  }

  if (debts.length > 0) {
    for (const d of debts) {
      debtMinimums += d.minPayment;
    }
  } else if (debtMinimums > 0) {
    warnings.push({ ref: "dívidas", reason: "mínimo de dívida estimado pelos pagamentos do mês" });
  }

  const budget: Budget = { income, fixed, variableEssential, debtMinimums };

  const state: FinancialState = {
    budget,
    goals,
    debts,
    reserveBalance,
    entries: [],
  };

  return {
    state,
    summary: {
      accepted: acceptedTransactions.length,
      rejected,
      duplicates,
      warnings,
      totals: budget,
    },
  };
}