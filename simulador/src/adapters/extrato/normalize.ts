import type { Cents } from "../../contracts/types";
import { parseMoney, MoneyError } from "../../engine/money";
import { CATEGORY_SLUGS, CATEGORY_BUCKET, type CategorySlug, type BudgetBucket } from "../../contracts/import-format";

export function normalizeCategory(slug: string | undefined): { slug: CategorySlug; warning?: string } {
  if (!slug || !CATEGORY_SLUGS.includes(slug as CategorySlug)) {
    const used = slug ? `'${slug}'` : "ausente";
    return { slug: "outros", warning: `categoria desconhecida ${used} tratada como outros` };
  }
  return { slug: slug as CategorySlug };
}

export function normalizeDescription(desc: string): string {
  return desc
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function makeDedupeKey(date: string, amountCents: Cents, description: string): string {
  return `${date}|${amountCents}|${normalizeDescription(description)}`;
}

export function parseAmount(text: string): Cents {
  try {
    return parseMoney(text);
  } catch (e) {
    if (e instanceof MoneyError) throw e;
    throw new MoneyError(`valor inválido: "${text}"`);
  }
}

export function getBucketForTransaction(categorySlug: CategorySlug, recurring: boolean, type: "CREDIT" | "DEBIT"): BudgetBucket {
  // Renda e dívida têm grupo próprio mesmo quando recorrentes (senão a parcela da dívida contaria em "fixas"
  // e de novo em debtMinimums); só as demais despesas recorrentes viram "fixas".
  const bucket = CATEGORY_BUCKET[categorySlug];
  if (bucket === "income" || bucket === "debt") return bucket;
  if (recurring && type === "DEBIT") return "fixed";
  return bucket;
}

export function validateReferenceMonth(date: string, referenceMonth: string): boolean {
  return date.startsWith(referenceMonth);
}

export function normalizeRecurring(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (!value) return false;
  const v = String(value).trim().toLowerCase();
  return v === "true" || v === "sim";
}

export function normalizeType(value: string | undefined): "CREDIT" | "DEBIT" | null {
  if (!value) return null;
  const v = String(value).trim().toUpperCase();
  if (v === "CREDIT" || v === "DEBIT") return v;
  return null;
}