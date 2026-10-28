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

const EMPTY_INTENT_FIELDS = {
  entries: [],
  tickers: [],
  months: null,
  searchTerm: null,
  goals: [],
  amount: null,
  incomeChangePct: null,
  proposedAllocation: [],
  missing: [],
  source: "mock" as const,
};

// Palavra-chave → categoria (para "gastei R$ 45 no mercado").
const ENTRY_CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/mercado|supermercado|feira|padaria|acougue/, "mercado"],
  [/aluguel|condominio/, "moradia"],
  [/luz|energia|agua|internet|telefone|celular|conta de/, "contas"],
  [/uber|onibus|metro|gasolina|combustivel|estacionamento|transporte/, "transporte"],
  [/farmacia|remedio|medico|consulta|exame|saude/, "saude"],
  [/curso|escola|faculdade|livro/, "educacao"],
  [/cinema|restaurante|bar|lanche|ifood|show|viagem|lazer|pizza/, "lazer"],
  [/cartao|fatura|emprestimo|parcela|divida/, "divida"],
  [/salario/, "salario"],
];

function entryCategory(norm: string): string {
  for (const [re, cat] of ENTRY_CATEGORY_KEYWORDS) if (re.test(norm)) return cat;
  return "outros";
}

function entryDescription(norm: string): string {
  const m = norm.match(/\b(?:no|na|em|com|de)\s+(?!r\$)([a-z ]{3,40}?)(?:\s+(?:hoje|ontem|agora)|[.,!?]|$)/);
  const d = (m?.[1] ?? "lançamento").trim();
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export function mockInterpret(userText: string): Intent {
  const norm = normalize(userText);

  // Registrar lançamento: verbo no passado + valor. Cada trecho ("45,90 no mercado e 40 no cinema") vira um lançamento.
  if (/\b(gastei|paguei|comprei|torrei)\b/.test(norm) || /\b(recebi|ganhei)\b/.test(norm)) {
    const receita = /\b(recebi|ganhei)\b/.test(norm);
    const segments = userText.split(/\s+e\s+|;|,\s+(?=\D)/i);
    const entries = segments.flatMap((seg) => {
      const amount = extractMoney(seg);
      if (amount === null || amount <= 0) return [];
      const segNorm = normalize(seg);
      return [
        {
          description: entryDescription(segNorm),
          amount,
          type: receita ? ("receita" as const) : ("despesa" as const),
          categorySlug: receita ? "outros" : entryCategory(segNorm),
          date: null, // o mock não resolve datas relativas ("ontem"): o usuário confere na confirmação
        },
      ];
    });
    if (entries.length > 0) return { ...EMPTY_INTENT_FIELDS, scenario: "registrar_gasto", entries };
  }

  // "Consigo pedir um iFood de R$ 60 hoje?" → posso gastar (gasto do dia a dia).
  if (/\b(consigo|posso|da pra|da para|cabe)\b/.test(norm) && /\b(hoje|agora|essa semana|esta semana)\b/.test(norm)) {
    const amount = extractMoney(userText);
    if (amount !== null && amount > 0) {
      const term = norm.match(/\b(?:pedir|comprar|gastar com|gastar no|gastar na|ir ao|ir no|ir na)\s+(?:um|uma|o|a)?\s*([a-z]+)/)?.[1] ?? null;
      return { ...EMPTY_INTENT_FIELDS, scenario: "pode_gastar", amount, searchTerm: term };
    }
  }

  // Investimentos: ticker citado ou vocabulário de investimento.
  const tickers = [...new Set((userText.toUpperCase().match(/\b[A-Z]{4}\d{1,2}\b/g) ?? []))].slice(0, 5);
  if (tickers.length > 0 || /\b(investir|invisto|investimento|investimentos|aplicar|acoes|acao|fii|fiis|cotacao|rendimento|render|renda fixa|tesouro|cdi|selic|reserva de emergencia)\b/.test(norm)) {
    return {
      ...EMPTY_INTENT_FIELDS,
      scenario: "investimento",
      tickers,
      amount: extractMoney(userText.replace(/\b[A-Z]{4}\d{1,2}\b/gi, "")),
      months: extractDeadlineMonths(norm),
    };
  }

  if (hasAllThreeGoals(norm)) {
    return {
      scenario: "alocar_metas",
      entries: [],
      tickers: [],
      months: null,
      searchTerm: null,
      goals: [
        createIntentGoal("reserva", null, null, null),
        createIntentGoal("computador", null, null, null),
        createIntentGoal("lazer", null, null, null),
      ],
      amount: null,
      incomeChangePct: null,
      // Sem modelo de IA não há "plano do Gemma": o comparador mostra só os planos do motor.
      proposedAllocation: [],
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
      entries: [],
      tickers: [],
      months: null,
      searchTerm: null,
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
        entries: [],
        tickers: [],
        months: null,
        searchTerm: null,
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
      entries: [],
      tickers: [],
      months: null,
      searchTerm: null,
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
      entries: [],
      tickers: [],
      months: null,
      searchTerm: null,
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
      entries: [],
      tickers: [],
      months: null,
      searchTerm: null,
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
    entries: [],
    tickers: [],
    months: null,
    searchTerm: null,
    goals: [],
    amount: null,
    incomeChangePct: null,
    proposedAllocation: [],
    missing: ["scenario"],
    source: "mock",
  };
}