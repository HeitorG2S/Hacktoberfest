import type { Priority, Cents, Goal } from "../../contracts/types";
import { parseMoney, formatMoney, MoneyError } from "../../engine/money";

export interface GoalForm {
  name: string;
  target: string;
  saved: string;
  deadlineMonths: string;
  priority: Priority;
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(base: string, existingIds: string[]): string {
  let id = base;
  let suffix = 2;
  while (existingIds.includes(id)) {
    id = `${base}-${suffix}`;
    suffix++;
  }
  return id;
}

export function validateGoalForm(
  f: GoalForm,
  existingIds: string[]
): { ok: true; goal: Goal } | { ok: false; errors: Partial<Record<keyof GoalForm, string>> } {
  const errors: Partial<Record<keyof GoalForm, string>> = {};

  const name = f.name.trim();
  if (!name) {
    errors.name = "Nome é obrigatório";
  } else if (name.length > 60) {
    errors.name = "Nome deve ter no máximo 60 caracteres";
  }

  let targetCents: Cents = 0;
  let targetValid = false;
  try {
    targetCents = parseMoney(f.target);
    if (targetCents <= 0) {
      errors.target = "Valor desejado deve ser maior que zero";
    } else {
      targetValid = true;
    }
  } catch {
    errors.target = "Valor desejado inválido";
  }

  let savedCents: Cents = 0;
  if (f.saved.trim()) {
    try {
      savedCents = parseMoney(f.saved);
      if (savedCents < 0) {
        errors.saved = "Valor guardado não pode ser negativo";
      } else if (targetValid && savedCents > targetCents) {
        errors.saved = "Valor guardado não pode ser maior que o desejado";
      }
    } catch {
      errors.saved = "Valor guardado inválido";
    }
  }

  let deadlineMonths: number | null = null;
  if (f.deadlineMonths.trim()) {
    const trimmed = f.deadlineMonths.trim();
    if (!/^\d+$/.test(trimmed)) {
      errors.deadlineMonths = "Prazo deve ser um inteiro entre 1 e 120";
    } else {
      const parsed = parseInt(trimmed, 10);
      if (parsed < 1 || parsed > 120) {
        errors.deadlineMonths = "Prazo deve ser um inteiro entre 1 e 120";
      } else {
        deadlineMonths = parsed;
      }
    }
  }

  if (!f.priority || !["alta", "media", "baixa"].includes(f.priority)) {
    errors.priority = "Prioridade inválida";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const baseId = slugify(name);
  const id = uniqueId(baseId, existingIds);

  const goal: Goal = {
    id,
    name,
    target: targetCents!,
    saved: savedCents,
    deadlineMonths,
    priority: f.priority,
  };

  return { ok: true, goal };
}

export function goalToForm(g: Goal): GoalForm {
  return {
    name: g.name,
    target: formatMoney(g.target).replace("R$ ", ""),
    saved: g.saved > 0 ? formatMoney(g.saved).replace("R$ ", "") : "",
    deadlineMonths: g.deadlineMonths !== null ? String(g.deadlineMonths) : "",
    priority: g.priority,
  };
}