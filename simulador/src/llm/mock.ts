import type { Intent, IntentGoal, Cents, Priority, ScenarioType } from "../contracts/types";
import { parseMoney } from "../engine/money";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const WORDS_TO_NUM: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
};

function extractNumber(text: string): number | null {
  const norm = normalize(text);

  const digitMatch = norm.match(/\b(\d+)\b/);
  if (digitMatch) return parseInt(digitMatch[1]!, 10);

  for (const [word, num] of Object.entries(WORDS_TO_NUM)) {
    if (norm.includes(word)) return num;
  }
  return null;
}

function extractMoney(text: string): Cents | null {
  const patterns = [
    /R\$\s*([\d.,]+)/gi,
    /\b(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)\s*(?:reais?|mil|k)\b/gi,
    /\b(\d[\d.,]*)\b/gi,
  ];

  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const valueStr = match[1]!.replace(/\s/g, "");
      try {
        if (/mil$|k$/i.test(match[0])) {
          const normalized = valueStr.replace(",", ".");
          const parts = normalized.split(".");
          const integerPart = parseInt(parts[0]!, 10) * 1000;
          let decimalPart = 0;
          if (parts[1]) {
            const decimalStr = (parts[1] + "00").slice(0, 3);
            decimalPart = parseInt(decimalStr, 10);
          }
          const totalReais = integerPart + decimalPart;
          return parseMoney(totalReais.toFixed(2));
        }
        return parseMoney(valueStr);
      } catch {
        continue;
      }
    }
  }
  return null;
}

function hasAllThreeGoals(text: string): boolean {
  const norm = normalize(text);
  return norm.includes("emergencia") && norm.includes("computador") && norm.includes("lazer");
}

function extractDeadlineMonths(norm: string): number | null {
  const numWords = Object.keys(WORDS_TO_NUM).join("|");
  const deadlineMatch = norm.match(new RegExp(`(\\d+|${numWords})\\s*(?:meses?|mes)\\b`));
  if (deadlineMatch) {
    return extractNumber(deadlineMatch[1]!);
  }
  return null;
}

function extractGoalName(norm: string): string {
  let goalNameMatch = norm.match(/(?:comprar|compra)\s+(?:um|uma|o|a\s+)?(.+?)(?:\s+(?:em|por|de|com|para|por\s+r\$|r\$|\d)\s|$)/);
  if (!goalNameMatch) {
    goalNameMatch = norm.match(/quero\s+(?:comprar\s+)?(?:um|uma|o|a\s+)?(.+?)(?:\s+(?:em|por|de|com|para|por\s+r\$|r\$|\d)\s|$)/);
  }
  if (goalNameMatch) {
    let name = goalNameMatch[1]!.trim();
    name = name.replace(/^(um|uma|o|a)\s+/i, "");
    return name;
  }
  return "compra";
}

function createIntentGoal(name: string, amount: Cents | null, deadlineMonths: number | null, priority: Priority | null): IntentGoal {
  return { name, amount, deadlineMonths, priority };
}

export function mockInterpret(userText: string): Intent {
  const norm = normalize(userText);

  if (hasAllThreeGoals(norm)) {
    return {
      scenario: "alocar_metas",
      goals: [
        createIntentGoal("reserva", null, null, null),
        createIntentGoal("computador", null, null, null),
        createIntentGoal("lazer", null, null, null),
      ],
      amount: null,
      incomeChangePct: null,
      proposedAllocation: [
        { goal: "reserva", amount: 30000 },
        { goal: "computador", amount: 20000 },
        { goal: "lazer", amount: 10000 },
      ],
      missing: [],
      source: "mock",
    };
  }

  const deadlineMonths = extractDeadlineMonths(norm);
  const money = extractMoney(userText);
  if (deadlineMonths !== null && money !== null) {
    const goalName = extractGoalName(norm);
    return {
      scenario: "meta_com_prazo",
      goals: [createIntentGoal(goalName, money, deadlineMonths, null)],
      amount: null,
      incomeChangePct: null,
      proposedAllocation: [],
      missing: [],
      source: "mock",
    };
  }

  if (norm.includes("perd") && norm.includes("renda")) {
    const pctMatch = norm.match(/(\d+)\s*%/);
    if (pctMatch) {
      const pct = -parseInt(pctMatch[1]!, 10);
      return {
        scenario: "perda_renda",
        goals: [],
        amount: null,
        incomeChangePct: pct,
        proposedAllocation: [],
        missing: [],
        source: "mock",
      };
    }
  }

  if ((norm.includes("inesperad") || norm.includes("imprevist") || (norm.includes("emergencia") && !hasAllThreeGoals(norm))) && money !== null) {
    return {
      scenario: "despesa_inesperada",
      goals: [],
      amount: money,
      incomeChangePct: null,
      proposedAllocation: [],
      missing: [],
      source: "mock",
    };
  }

  if (norm.includes("divida") && norm.includes("reserva")) {
    return {
      scenario: "divida_vs_reserva",
      goals: [],
      amount: null,
      incomeChangePct: null,
      proposedAllocation: [],
      missing: [],
      source: "mock",
    };
  }

  if ((norm.includes("comprar") || norm.includes("compra")) && money !== null) {
    const goalName = extractGoalName(norm);
    return {
      scenario: "compra",
      goals: [createIntentGoal(goalName, money, null, null)],
      amount: money,
      incomeChangePct: null,
      proposedAllocation: [],
      missing: [],
      source: "mock",
    };
  }

  return {
    scenario: "desconhecido",
    goals: [],
    amount: null,
    incomeChangePct: null,
    proposedAllocation: [],
    missing: ["scenario"],
    source: "mock",
  };
}