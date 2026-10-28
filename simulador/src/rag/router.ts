import type { Intent } from "../contracts/types";

// Etapa 1 do RAG (roteamento) — atalho local: perguntas comuns sobre os próprios dados são respondidas por
// template, sem chamar a IA (mais rápido, sem custo e sem enviar nada para fora).
// Devolve a intenção já pronta, ou null para seguir pelo Gemma.

const BASE: Omit<Intent, "scenario" | "searchTerm"> = {
  entries: [], tickers: [], months: null, goals: [], amount: null, incomeChangePct: null, proposedAllocation: [], missing: [], source: "mock",
};

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function quickRoute(text: string): Intent | null {
  const t = norm(text);
  // "quanto gastei com ifood?", "quanto gastei no mercado este mês"
  const spent = t.match(/quanto (?:eu )?(?:ja )?gastei (?:com|em|no|na|de|nos|nas)\s+(.+?)(?:\s+(?:este|esse|neste|nesse) mes)?\s*\??$/);
  if (spent) return { ...BASE, scenario: "consulta", searchTerm: spent[1]!.replace(/^(o|a|os|as)\s+/, "").trim() };
  // "quanto tenho?", "qual meu saldo?", "quanto sobrou?", "qual minha maior despesa?"
  if (/^(quanto (eu )?(tenho|sobrou|sobra)|qual (e )?(o )?meu saldo|meu saldo|qual (e )?(a )?minha maior (despesa|gasto)|maior (despesa|gasto))\b[^0-9]*$/.test(t)) {
    return { ...BASE, scenario: "consulta", searchTerm: null };
  }
  return null;
}
