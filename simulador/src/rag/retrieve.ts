import type { Cents, FinancialState, Intent, Quote, RetrievedDoc } from "../contracts/types";
import { fetchQuote as brapiQuote } from "../brapi/client";
import { formatMoney, formatRateBps, monthSummary, projectInvestment, sharesFor } from "../engine";

// Recuperação do RAG: transforma a intenção em documentos curtos e verificáveis.
// - "brapi:<TICKER>": cotação vinda da Brapi (fonte externa, com horário).
// - "motor:*": números calculados pelo motor determinístico (o LLM nunca calcula).
// Dados do orçamento do usuário só entram com includeBudget (mesma regra de privacidade do simulador).

export interface RetrieveOptions {
  month: string; // AAAA-MM
  now?: Date;
  includeBudget?: boolean;
  fetchQuote?: (symbol: string) => Promise<Quote>;
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

export async function retrieveDocs(intent: Intent, state: FinancialState, opts: RetrieveOptions): Promise<{ docs: RetrievedDoc[]; errors: string[] }> {
  const fetchedAt = (opts.now ?? new Date()).toISOString();
  const getQuote = opts.fetchQuote ?? ((s: string) => brapiQuote(s));
  const docs: RetrievedDoc[] = [];
  const errors: string[] = [];
  const amount: Cents | null = intent.amount !== null && intent.amount > 0 ? intent.amount : null;

  // 1) Cotações (no máximo 3 ativos: plano grátis = 1 ativo por chamada).
  const quotes: Quote[] = [];
  const tickers = intent.tickers.slice(0, 3);
  const settled = await Promise.allSettled(tickers.map((t) => getQuote(t)));
  settled.forEach((r, k) => {
    if (r.status === "fulfilled") {
      quotes.push(r.value);
      docs.push(quoteDoc(r.value, fetchedAt));
    } else {
      errors.push(`${tickers[k]}: ${r.reason instanceof Error ? r.reason.message : "erro ao consultar a Brapi"}`);
    }
  });

  // 2) Quantas cotas cabem no valor citado (motor).
  if (amount !== null) {
    for (const q of quotes) {
      const s = sharesFor(amount, q.price);
      docs.push({
        id: `motor:cotas-${q.symbol}`,
        source: "motor",
        title: `Cotas de ${q.symbol} com ${formatMoney(amount)}`,
        text:
          s.shares > 0
            ? `Com ${formatMoney(amount)} dá para comprar ${s.shares} cota(s) inteira(s) de ${q.symbol} a ${formatMoney(q.price)}, custando ${formatMoney(s.cost)} e sobrando ${formatMoney(s.leftover)}. Cálculo do motor do app.`
            : `Com ${formatMoney(amount)} não dá para comprar nenhuma cota inteira de ${q.symbol}, que custa ${formatMoney(q.price)}. Cálculo do motor do app.`,
        url: null,
        fetchedAt,
      });
    }
  }

  // 3) Projeção de renda fixa com a taxa que o USUÁRIO informou (a Brapi grátis não fornece Selic/CDI).
  const wantsProjection = amount !== null && (intent.months !== null || intent.tickers.length === 0);
  if (wantsProjection) {
    const months = intent.months ?? DEFAULT_MONTHS;
    if (state.investment) {
      const p = projectInvestment(amount, months, state.investment.annualRateBps);
      docs.push({
        id: "motor:projecao",
        source: "motor",
        title: "Projeção de aportes",
        text:
          `Aportando ${formatMoney(amount)} por mês durante ${months} meses a ${formatRateBps(state.investment.annualRateBps)} ao ano ` +
          `(taxa informada pelo usuário: ${state.investment.label}), o total aportado é ${formatMoney(p.totalContributed)} e o saldo projetado é ` +
          `${formatMoney(p.finalBalance)}, com ${formatMoney(p.interest)} de rendimento. Projeção do motor a taxa constante, sem impostos nem taxas.`,
        url: null,
        fetchedAt,
      });
    } else {
      docs.push({
        id: "motor:sem-taxa",
        source: "motor",
        title: "Taxa de referência ausente",
        text: "O usuário ainda não informou uma taxa de referência anual; sem ela o app não projeta rendimento. Ela pode ser cadastrada na aba Investimentos.",
        url: null,
        fetchedAt,
      });
    }
  }

  // 4) Disponível do mês (só com permissão do usuário).
  if (opts.includeBudget) {
    const s = monthSummary(state, opts.month);
    docs.push({
      id: "motor:disponivel",
      source: "motor",
      title: "Disponível do mês",
      text: `O disponível do usuário em ${opts.month}, depois das despesas planejadas e dos lançamentos, é ${formatMoney(s.effectiveAvailable)}. Cálculo do motor do app.`,
      url: null,
      fetchedAt,
    });
  }

  return { docs, errors };
}
