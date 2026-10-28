import { z } from "zod";
import type { Quote, TickerInfo } from "../contracts/types";
import { priceToCents } from "../engine/money";

// Cliente da Brapi (https://brapi.dev), SEM token: o navegador chama a API pública direto (CORS liberado).
// Sem token, /v2/stocks/quote só responde para PETR4, MGLU3, VALE3 e ITUB4 (cotação com horário);
// os demais ativos vêm da lista pública (/quote/list), que traz o último fechamento sem horário.
// Só tickers saem do navegador: nenhum dado financeiro do usuário vai à Brapi.

const BASE = "https://brapi.dev/api";
// Ativos que a Brapi cota sem token (documentação: brapi.dev/docs).
export const PUBLIC_QUOTE_SYMBOLS = new Set(["PETR4", "MGLU3", "VALE3", "ITUB4"]);
const TIMEOUT_MS = 10000;
const CACHE_MS = 60000;
export const TICKER_RE = /^[A-Z]{4}\d{1,2}$/;

export class BrapiError extends Error {}

const QuoteV2Schema = z.object({
  results: z
    .array(
      z.object({
        symbol: z.string(),
        data: z
          .object({
            shortName: z.string().nullish(),
            longName: z.string().nullish(),
            currency: z.string().nullish(),
            regularMarketPrice: z.number(),
            regularMarketChangePercent: z.number().nullish(),
            regularMarketTime: z.string().nullish(),
            logourl: z.string().nullish(),
          })
          .passthrough(),
      }),
    )
    .min(1),
});

const ListSchema = z.object({
  stocks: z.array(
    z
      .object({
        stock: z.string(),
        name: z.string().nullish(),
        close: z.number().nullish(),
        change: z.number().nullish(),
        logo: z.string().nullish(),
        sector: z.string().nullish(),
        type: z.string().nullish(),
      })
      .passthrough(),
  ),
});

type Fetch = typeof fetch;
const cache = new Map<string, { at: number; value: unknown }>();

async function getJson(path: string, fetchImpl: Fetch): Promise<{ status: number; body: unknown }> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return { status: 200, body: hit.value };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${BASE}${path}`, { signal: controller.signal });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) cache.set(path, { at: Date.now(), value: body });
    return { status: res.status, body };
  } catch (e) {
    throw new BrapiError(e instanceof Error && e.name === "AbortError" ? "a Brapi não respondeu a tempo" : "falha de rede ao consultar a Brapi");
  } finally {
    clearTimeout(timer);
  }
}

export function clearBrapiCache(): void {
  cache.clear();
}

// Busca de ativos por ticker ou nome (endpoint público).
export async function searchTickers(query: string, opts: { fetchImpl?: Fetch; limit?: number } = {}): Promise<TickerInfo[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { status, body } = await getJson(`/quote/list?search=${encodeURIComponent(q)}&limit=${opts.limit ?? 8}`, opts.fetchImpl ?? fetch);
  if (status !== 200) throw new BrapiError(`a Brapi recusou a busca (HTTP ${status})`);
  const parsed = ListSchema.safeParse(body);
  if (!parsed.success) throw new BrapiError("resposta inesperada da Brapi na busca");
  return parsed.data.stocks.map((s) => ({ symbol: s.stock, name: s.name ?? s.stock, type: s.type ?? "stock", sector: s.sector ?? null }));
}

// Cotação de um ativo. Para os ativos públicos usa /v2/stocks/quote (com horário); para os demais, ou se a
// Brapi recusar (401/403), usa o fechamento da lista pública.
export async function fetchQuote(symbol: string, opts: { fetchImpl?: Fetch } = {}): Promise<Quote> {
  const sym = symbol.trim().toUpperCase();
  if (!TICKER_RE.test(sym)) throw new BrapiError(`ticker inválido: "${symbol}"`);
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (!PUBLIC_QUOTE_SYMBOLS.has(sym)) return quoteFromList(sym, fetchImpl);

  const { status, body } = await getJson(`/v2/stocks/quote?symbols=${sym}`, fetchImpl);
  if (status === 200) {
    const parsed = QuoteV2Schema.safeParse(body);
    if (!parsed.success) throw new BrapiError("resposta inesperada da Brapi na cotação");
    const r = parsed.data.results[0]!;
    const d = r.data;
    return {
      symbol: r.symbol,
      name: d.longName ?? d.shortName ?? r.symbol,
      price: priceToCents(d.regularMarketPrice),
      changePct: d.regularMarketChangePercent ?? null,
      currency: d.currency ?? "BRL",
      updatedAt: d.regularMarketTime ?? null,
      logoUrl: d.logourl ?? null,
    };
  }
  if (status !== 401 && status !== 403) {
    if (status === 404) throw new BrapiError(`ativo ${sym} não encontrado na Brapi`);
    if (status === 429) throw new BrapiError("limite de requisições da Brapi atingido; tente mais tarde");
    throw new BrapiError(`a Brapi recusou a cotação (HTTP ${status})`);
  }

  return quoteFromList(sym, fetchImpl);
}

async function quoteFromList(sym: string, fetchImpl: Fetch): Promise<Quote> {
  const list = await getJson(`/quote/list?search=${sym}&limit=5`, fetchImpl);
  if (list.status === 429) throw new BrapiError("limite de requisições da Brapi atingido; tente mais tarde");
  if (list.status !== 200) throw new BrapiError(`a Brapi recusou a consulta (HTTP ${list.status})`);
  const parsed = ListSchema.safeParse(list.body);
  const item = parsed.success ? parsed.data.stocks.find((s) => s.stock.toUpperCase() === sym) : undefined;
  if (!item || item.close == null) throw new BrapiError(`ativo ${sym} não encontrado na Brapi`);
  return {
    symbol: item.stock,
    name: item.name ?? item.stock,
    price: priceToCents(item.close),
    changePct: item.change ?? null,
    currency: "BRL",
    updatedAt: null, // a lista pública não informa o horário: tratamos como "último fechamento"
    logoUrl: item.logo ?? null,
  };
}

// Cotação com horário (ativos públicos) ou último fechamento (demais).
export function hasIntradayQuote(symbol: string): boolean {
  return PUBLIC_QUOTE_SYMBOLS.has(symbol.trim().toUpperCase());
}
