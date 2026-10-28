import { RawIntentSchema, type RawIntent, SCENARIOS } from "../contracts/llm-schema";
import { CATEGORY_SLUGS } from "../contracts/import-format";
import type { Intent, IntentGoal, Cents, Priority, ProposedEntry, ScenarioType } from "../contracts/types";
import { parseMoney } from "../engine/money";

export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const fenceMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1]!);
  }

  let depth = 0;
  let start = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          const candidate = trimmed.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            // continue searching
          }
        }
      }
    }
  }

  throw new Error("Nenhum objeto JSON encontrado na resposta");
}

function toPriority(value: "alta" | "media" | "baixa" | null): Priority | null {
  return value;
}

function toScenario(value: string): ScenarioType {
  if (SCENARIOS.includes(value as (typeof SCENARIOS)[number])) {
    return value as ScenarioType;
  }
  return "desconhecido";
}

// Categoria livre do LLM → slug conhecido (sem acento/caixa); desconhecida vira "outros".
const CATEGORY_ALIASES: Record<string, string> = {
  alimentacao: "mercado", supermercado: "mercado", comida: "mercado", feira: "mercado",
  aluguel: "moradia", condominio: "moradia", luz: "contas", agua: "contas", internet: "contas", telefone: "contas",
  uber: "transporte", onibus: "transporte", combustivel: "transporte", gasolina: "transporte",
  farmacia: "saude", remedio: "saude", medico: "saude", restaurante: "lazer", cinema: "lazer",
  curso: "educacao", escola: "educacao", cartao: "divida", emprestimo: "divida",
};
export function normalizeCategory(raw: string): string {
  const s = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if ((CATEGORY_SLUGS as readonly string[]).includes(s)) return s;
  return CATEGORY_ALIASES[s] ?? "outros";
}

export function toIntent(raw: RawIntent, source: "api" | "mock"): Intent {
  const goals: IntentGoal[] = raw.goals.map((g) => ({
    name: g.name,
    amount: g.amount !== null ? parseMoney(g.amount) : null,
    deadlineMonths: g.deadline_months,
    priority: g.priority !== null ? toPriority(g.priority) : null,
  }));

  const proposedAllocation = raw.proposed_allocation.map((p) => ({
    goal: p.goal,
    amount: parseMoney(p.amount),
  }));

  const entries: ProposedEntry[] = raw.entries.map((e) => ({
    description: e.description,
    amount: parseMoney(e.amount),
    type: e.type,
    categorySlug: normalizeCategory(e.category),
    date: e.date,
  }));

  return {
    scenario: toScenario(raw.scenario),
    entries,
    tickers: raw.tickers,
    months: raw.months,
    goals,
    amount: raw.amount !== null ? parseMoney(raw.amount) : null,
    incomeChangePct: raw.income_change_pct,
    proposedAllocation,
    missing: raw.missing,
    source,
  };
}

export function parseLlmText(
  text: string,
  source: "api" | "mock"
): { ok: true; intent: Intent } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao extrair JSON" };
  }

  // Tolerância: "este mês" às vezes vem como deadline_months 0; prazo zero não existe, vira null.
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { goals?: unknown }).goals)) {
    for (const g of (parsed as { goals: { deadline_months?: unknown }[] }).goals) {
      if (g && typeof g === "object" && g.deadline_months === 0) g.deadline_months = null;
    }
  }
  const result = RawIntentSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { ok: false, error: `Validação falhou: ${issues}` };
  }

  try {
    const intent = toIntent(result.data, source);
    return { ok: true, intent };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao converter para Intent" };
  }
}