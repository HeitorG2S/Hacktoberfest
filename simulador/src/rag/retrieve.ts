import type { Cents, FinancialState, Intent, Quote, RetrievedDoc } from "../contracts/types";
import { fetchQuote as brapiQuote } from "../brapi/client";
import {
  biggestExpense,
  fixedPending,
  formatMoney,
  formatRateBps,
  investmentGuidance,
  monthSummary,
  projectInvestment,
  sharesFor,
  spendCheck,
  totalOf,
} from "../engine";
import { normalizeCategory } from "../llm/parse";
import { buildEntryIndex, searchEntries } from "./vector";

// Etapa 2 do RAG (recuperação): transforma a intenção em documentos curtos e verificáveis, e num RASCUNHO de
// resposta montado pelo motor (veredito + sugestão), que o LLM só reescreve.
// - "brapi:<TICKER>": cotação da Brapi (pública).
// - "motor:*": números calculados pelo motor determinístico a partir dos dados locais do usuário (pessoais).

export interface RetrieveOptions {
  month: string; // AAAA-MM
  today?: string; // AAAA-MM-DD (para "hoje" e dias restantes do mês)
  now?: Date;
  includeBudget?: boolean; // mantido por compatibilidade: inclui o disponível do mês nos docs de investimento
  fetchQuote?: (symbol: string) => Promise<Quote>;
}

export interface Retrieval {
  docs: RetrievedDoc[];
  errors: string[];
  draft: string; // resposta pronta do motor (usada quando a IA não pode/consegue responder)
}

// LGPD: remove do texto o que identifica pessoas ou contas (CPF/CNPJ, sequências longas de dígitos, e-mails).
export function anonymize(text: string): string {
  return text
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[documento]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[documento]")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[e-mail]")
    .replace(/\b\d{6,}\b/g, "[número]");
}

const DEFAULT_MONTHS = 12;

export function formatPct(n: number): string {
  // Indicador (não dinheiro): 2 casas, vírgula decimal, com sinal.
  const s = Math.abs(n).toFixed(2).replace(".", ",");
  return `${n >= 0 ? "+" : "−"}${s}%`;
}


function formatWhen(iso: string | null): string {
  if (!iso) return "último fechamento (a Brapi não informou o horário)";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "horário não informado";
  return `cotação de ${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function quoteDoc(q: Quote, fetchedAt: string): RetrievedDoc {
  const change = q.changePct === null ? "variação do dia não informada" : `variação no dia de ${formatPct(q.changePct)}`;
  return {
    id: `brapi:${q.symbol}`,
    source: "brapi",
    title: `${q.symbol} — ${q.name}`,
    text: `${q.symbol} (${q.name}): preço ${formatMoney(q.price)}, ${change}, ${formatWhen(q.updatedAt)}. Fonte: Brapi.`,
    url: `https://brapi.dev/quote/${q.symbol}`,
    fetchedAt,
  };
}

const personal = (doc: Omit<RetrievedDoc, "personal">): RetrievedDoc => ({ ...doc, text: anonymize(doc.text), personal: true });

function todayOf(opts: RetrieveOptions): string {
  return opts.today ?? `${opts.month}-01`;
}

// ---- "Posso gastar X hoje?" ----
function retrieveSpend(intent: Intent, state: FinancialState, opts: RetrieveOptions, fetchedAt: string): Retrieval {
  const docs: RetrievedDoc[] = [];
  const amount = intent.amount;
  if (amount === null || amount <= 0) {
    return { docs, errors: [], draft: "Para eu verificar, diga o valor do gasto. Ex.: \"consigo pedir um iFood de R$ 60 hoje?\"" };
  }
  const today = todayOf(opts);
  const term = intent.searchTerm ?? "";
  const index = buildEntryIndex(state.entries.filter((e) => e.date.startsWith(opts.month)));
  const similar = term ? searchEntries(index, term).map((r) => r.entry) : [];
  // Categoria do gasto: a mais comum entre os lançamentos parecidos; senão, pelo nome do termo.
  const counts = new Map<string, number>();
  for (const e of similar) counts.set(e.categorySlug, (counts.get(e.categorySlug) ?? 0) + 1);
  const category = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (term ? normalizeCategory(term) : "outros");
  const c = spendCheck(state, amount, today, category);
  docs.push(
    personal({
      id: "motor:limite-dia",
      source: "motor",
      title: "Limite do dia",
      text: `Valor que o usuário quer gastar: ${formatMoney(amount)}. Livre no mês sem mexer nas metas: ${formatMoney(Math.max(0, c.freeMonth))}. Restam ${c.daysLeft} dia(s) no mês, então o limite planejado para hoje é ${formatMoney(c.dailyFree)}.`,
      url: null,
      fetchedAt,
    }),
  );
  if (similar.length) {
    docs.push(
      personal({
        id: "motor:historico",
        source: "motor",
        title: `Gastos parecidos com "${term}" no mês`,
        text: `Neste mês o usuário já gastou ${formatMoney(totalOf(similar))} em ${similar.length} lançamento(s) parecidos com "${term}".`,
        url: null,
        fetchedAt,
      }),
    );
  }
  if (c.box) {
    docs.push(
      personal({
        id: "motor:caixinha",
        source: "motor",
        title: `Meta ${c.box.goalName}`,
        text: `Na meta "${c.box.goalName}" ainda cabem ${formatMoney(c.box.remaining)} neste mês; desse gasto, ${formatMoney(c.box.fromBox)} sairiam dela e ${formatMoney(amount - c.box.fromBox)} do dinheiro livre do mês.`,
        url: null,
        fetchedAt,
      }),
    );
  }
  const pending = fixedPending(state, opts.month);
  if (pending > 0) {
    docs.push(
      personal({ id: "motor:fixas", source: "motor", title: "Contas fixas a pagar", text: `Ainda faltam ${formatMoney(pending)} de contas fixas planejadas para o mês.`, url: null, fetchedAt }),
    );
  }

  const fromFree = amount - (c.box?.fromBox ?? 0);
  const boxPart = c.box
    ? c.box.fromBox >= amount
      ? `Cabe inteiro na meta "${c.box.goalName}" (ainda tem ${formatMoney(c.box.remaining)}). `
      : `A meta "${c.box.goalName}" só tem ${formatMoney(c.box.remaining)} neste mês, então ${formatMoney(fromFree)} sairiam do dinheiro livre. `
    : "";
  let draft: string;
  if (c.box && c.box.fromBox >= amount) draft = `Pode sim. ${boxPart}O resto do orçamento não é afetado.`;
  else if (c.verdict === "cabe_no_dia") draft = `${boxPart}Pode sim: ${formatMoney(fromFree)} cabe no seu limite de hoje (${formatMoney(c.dailyFree)}), sem mexer nas outras metas.`;
  else if (c.verdict === "cabe_no_mes")
    draft = `${boxPart}Dá, mas passa ${formatMoney(c.overDaily)} do seu limite de hoje (${formatMoney(c.dailyFree)}). No mês ainda há ${formatMoney(c.freeMonth)} livres, então as metas não são afetadas, só sobra menos para os próximos ${c.daysLeft - 1} dia(s). Alternativa: gastar até ${formatMoney(c.dailyFree)} hoje ou deixar para outro dia.`;
  else if (c.verdict === "reduz_metas")
    draft = `${boxPart}Cabe no disponível do mês, mas tira ${formatMoney(c.goalCut)} das suas metas, porque só há ${formatMoney(Math.max(0, c.freeMonth))} livres além delas. Alternativa: gastar até ${formatMoney(c.dailyFree)} hoje para manter o ritmo.`;
  else draft = `Não cabe: faltam ${formatMoney(c.shortfall)} no disponível do mês (${formatMoney(Math.max(0, c.effectiveAvailable))}). Melhor adiar ou escolher algo de até ${formatMoney(c.dailyFree)}.`;
  return { docs, errors: [], draft };
}

// ---- Consultas aos próprios dados ("quanto gastei com X?", "maior despesa?", "quanto tenho?") ----
function retrieveQuery(intent: Intent, state: FinancialState, opts: RetrieveOptions, fetchedAt: string): Retrieval {
  const docs: RetrievedDoc[] = [];
  const s = monthSummary(state, opts.month);
  const term = intent.searchTerm?.trim() ?? "";
  if (term) {
    const index = buildEntryIndex(state.entries.filter((e) => e.date.startsWith(opts.month)));
    const found = searchEntries(index, term).map((r) => r.entry);
    const top = found.slice(0, 5).map((e) => `${e.description} ${formatMoney(e.amount)} em ${e.date.split("-").reverse().join("/")}`);
    docs.push(
      personal({
        id: "motor:busca",
        source: "motor",
        title: `Lançamentos sobre "${term}"`,
        text: found.length
          ? `Em ${opts.month}, os lançamentos parecidos com "${term}" somam ${formatMoney(totalOf(found))} em ${found.length} lançamento(s): ${top.join("; ")}.`
          : `Em ${opts.month} não há lançamentos parecidos com "${term}".`,
        url: null,
        fetchedAt,
      }),
    );
    return { docs, errors: [], draft: docs[0]!.text };
  }
  const big = biggestExpense(state, opts.month);
  docs.push(
    personal({
      id: "motor:resumo-mes",
      source: "motor",
      title: "Resumo do mês",
      text:
        `Disponível do mês depois dos lançamentos: ${formatMoney(s.effectiveAvailable)}. Gastos fora do planejado: ${formatMoney(s.spentByBucket.discretionary)} em lazer/outros e ${formatMoney(s.overspend)} acima do planejado. ` +
        (big ? `Maior despesa do mês: ${big.description}, ${formatMoney(big.amount)}.` : "Nenhuma despesa lançada no mês."),
      url: null,
      fetchedAt,
    }),
  );
  return { docs, errors: [], draft: docs[0]!.text };
}

// ---- Investimentos: trilha do motor + cotações da Brapi + projeção ----

async function retrieveInvest(intent: Intent, state: FinancialState, opts: RetrieveOptions, fetchedAt: string): Promise<Retrieval> {
  const getQuote = opts.fetchQuote ?? ((s: string) => brapiQuote(s));
  const docs: RetrievedDoc[] = [];
  const errors: string[] = [];
  const amount: Cents | null = intent.amount !== null && intent.amount > 0 ? intent.amount : null;
  const draftParts: string[] = [];

  // Trilha (sugestões calculadas pelo motor a partir do orçamento do usuário).
  const g = investmentGuidance(state, opts.month);
  g.steps.forEach((st, k) => {
    docs.push(personal({ id: `motor:trilha-${st.id}`, source: "motor", title: `Passo ${k + 1}: ${st.title}`, text: `${st.title}. ${st.detail}`, url: null, fetchedAt }));
    draftParts.push(`${k + 1}) ${st.title}: ${st.detail}`);
  });

  // Cotações (no máximo 3 ativos), em paralelo.
  const quotes: Quote[] = [];
  const tickers = intent.tickers.slice(0, 3);
  const settled = await Promise.allSettled(tickers.map((t) => getQuote(t)));
  settled.forEach((r, k) => {
    if (r.status === "fulfilled") {
      quotes.push(r.value);
      docs.push(quoteDoc(r.value, fetchedAt));
      draftParts.push(quoteDoc(r.value, fetchedAt).text);
    } else {
      errors.push(`${tickers[k]}: ${r.reason instanceof Error ? r.reason.message : "erro ao consultar a Brapi"}`);
    }
  });

  if (amount !== null) {
    for (const q of quotes) {
      const s = sharesFor(amount, q.price);
      const text =
        s.shares > 0
          ? `Com ${formatMoney(amount)} dá para comprar ${s.shares} cota(s) inteira(s) de ${q.symbol} a ${formatMoney(q.price)}, custando ${formatMoney(s.cost)} e sobrando ${formatMoney(s.leftover)}.`
          : `Com ${formatMoney(amount)} não dá para comprar nenhuma cota inteira de ${q.symbol}, que custa ${formatMoney(q.price)}.`;
      docs.push({ id: `motor:cotas-${q.symbol}`, source: "motor", title: `Cotas de ${q.symbol} com ${formatMoney(amount)}`, text: `${text} Cálculo do motor do app.`, url: null, fetchedAt });
      draftParts.push(text);
    }
  }

  // Projeção com a taxa que o usuário informou (a Brapi pública não fornece Selic/CDI).
  if (amount !== null && (intent.months !== null || intent.tickers.length === 0)) {
    const months = intent.months ?? DEFAULT_MONTHS;
    if (state.investment) {
      const p = projectInvestment(amount, months, state.investment.annualRateBps);
      const text =
        `Aportando ${formatMoney(amount)} por mês durante ${months} meses a ${formatRateBps(state.investment.annualRateBps)} ao ano ` +
        `(taxa informada pelo usuário: ${state.investment.label}), o total aportado é ${formatMoney(p.totalContributed)} e o saldo projetado é ` +
        `${formatMoney(p.finalBalance)}, com ${formatMoney(p.interest)} de rendimento. Projeção do motor a taxa constante, sem impostos nem taxas.`;
      docs.push({ id: "motor:projecao", source: "motor", title: "Projeção de aportes", text, url: null, fetchedAt });
      draftParts.push(text);
    } else {
      const text = "Para projetar rendimento, informe uma taxa de referência anual na aba Investimentos (ex.: o CDI do seu banco).";
      docs.push({ id: "motor:sem-taxa", source: "motor", title: "Taxa de referência ausente", text, url: null, fetchedAt });
      draftParts.push(text);
    }
  }

  if (opts.includeBudget) {
    const s = monthSummary(state, opts.month);
    docs.push(
      personal({
        id: "motor:disponivel",
        source: "motor",
        title: "Disponível do mês",
        text: `O disponível do usuário em ${opts.month}, depois das despesas planejadas e dos lançamentos, é ${formatMoney(s.effectiveAvailable)}. Cálculo do motor do app.`,
        url: null,
        fetchedAt,
      }),
    );
  }

  return { docs, errors, draft: draftParts.join(" ") };
}

export async function retrieveDocs(intent: Intent, state: FinancialState, opts: RetrieveOptions): Promise<Retrieval> {
  const fetchedAt = (opts.now ?? new Date()).toISOString();
  if (intent.scenario === "pode_gastar") return retrieveSpend(intent, state, opts, fetchedAt);
  if (intent.scenario === "consulta") return retrieveQuery(intent, state, opts, fetchedAt);
  return retrieveInvest(intent, state, opts, fetchedAt);
}
