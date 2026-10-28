import type { Entry, EntryType, Cents } from "../../contracts/types";
import { CATEGORY_SLUGS } from "../../contracts/import-format";
import { parseMoney, MoneyError } from "../../engine/money";

export interface EntryForm {
  date: string;
  description: string;
  amount: string;
  type: EntryType;
  categorySlug: string;
}

export function emptyEntryForm(todayIso: string): EntryForm {
  return {
    date: todayIso,
    description: "",
    amount: "",
    type: "despesa",
    categorySlug: "mercado",
  };
}

function isValidDate(dateStr: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function generateUniqueId(existingIds: string[], newId: () => string): string {
  let id = newId();
  let attempts = 0;
  while (existingIds.includes(id) && attempts < 100) {
    id = newId();
    attempts++;
  }
  return id;
}

export function validateEntryForm(
  f: EntryForm,
  existingIds: string[],
  newId: () => string
): { ok: true; entry: Entry } | { ok: false; errors: Partial<Record<keyof EntryForm, string>> } {
  const errors: Partial<Record<keyof EntryForm, string>> = {};

  const description = f.description.trim();
  if (description.length === 0 || description.length > 90) {
    errors.description = "Descrição deve ter 1 a 90 caracteres";
  }

  let amountCents: Cents;
  try {
    amountCents = parseMoney(f.amount);
    if (amountCents <= 0) {
      errors.amount = "Valor deve ser maior que zero";
    }
  } catch {
    errors.amount = "Valor inválido";
  }

  if (!isValidDate(f.date)) {
    errors.date = "Data inválida (AAAA-MM-DD)";
  }

  if (!CATEGORY_SLUGS.includes(f.categorySlug as (typeof CATEGORY_SLUGS)[number])) {
    errors.categorySlug = "Categoria inválida";
  }

  if (f.type !== "despesa" && f.type !== "receita") {
    errors.type = "Tipo inválido";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const id = generateUniqueId(existingIds, newId);

  const entry: Entry = {
    id,
    date: f.date,
    description,
    amount: amountCents!,
    type: f.type,
    categorySlug: f.categorySlug,
    source: "manual",
  };

  return { ok: true, entry };
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.id.localeCompare(a.id);
  });
}