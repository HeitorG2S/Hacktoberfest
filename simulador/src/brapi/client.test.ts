import { beforeEach, describe, expect, it } from "vitest";
import { BrapiError, clearBrapiCache, fetchQuote, searchTickers } from "./client";

type Route = Record<string, { status: number; body: unknown }>;
const fake = (routes: Route, calls: string[] = []): typeof fetch =>
  (async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    const key = Object.keys(routes).find((k) => u.includes(k));
    const r = key ? routes[key]! : { status: 404, body: { error: true } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;

const V2 = { results: [{ symbol: "PETR4", data: { longName: "Petroleo Brasileiro SA Pfd", currency: "BRL", regularMarketPrice: 52.99, regularMarketChangePercent: 0.38, regularMarketTime: "2026-10-28T19:47:30.000Z", logourl: "x.svg" } }] };
const LIST = { stocks: [{ stock: "MXRF11", name: "MAXI RENDA FII", close: 9.875, change: -0.1, logo: null, sector: null, type: "fund" }, { stock: "MXRF12", name: "outro", close: 1, type: "fund" }] };

beforeEach(() => clearBrapiCache());

describe("fetchQuote", () => {
  it("usa /v2/stocks/quote e converte o preço para centavos", async () => {
    const calls: string[] = [];
    const q = await fetchQuote("petr4", { fetchImpl: fake({ "/v2/stocks/quote?symbols=PETR4": { status: 200, body: V2 } }, calls) });
    expect(q).toMatchObject({ symbol: "PETR4", price: 5299, changePct: 0.38, name: "Petroleo Brasileiro SA Pfd" });
    expect(calls[0]).toBe("https://brapi.dev/api/v2/stocks/quote?symbols=PETR4");
  });

  it("ativo fora dos públicos vai direto à lista, sem chamar a cotação detalhada", async () => {
    const calls: string[] = [];
    const q = await fetchQuote("MXRF11", { fetchImpl: fake({ "/quote/list?search=MXRF11": { status: 200, body: LIST } }, calls) });
    expect(q.price).toBe(988);
    expect(calls).toEqual(["https://brapi.dev/api/quote/list?search=MXRF11&limit=5"]);
  });

  it("ativo público recusado (401) cai na lista pública", async () => {
    const LIST_ITUB = { stocks: [{ stock: "ITUB4", name: "ITAU", close: 39.96, change: -2.99, type: "stock" }] };
    const q = await fetchQuote("ITUB4", {
      fetchImpl: fake({ "/v2/stocks/quote": { status: 401, body: {} }, "/quote/list?search=ITUB4": { status: 200, body: LIST_ITUB } }),
    });
    expect(q.price).toBe(3996);
    expect(q.updatedAt).toBeNull();
  });

  it("lista pública: acha o ticker exato", async () => {
    const q = await fetchQuote("MXRF11", {
      fetchImpl: fake({ "/v2/stocks/quote": { status: 401, body: { code: "MISSING_TOKEN" } }, "/quote/list?search=MXRF11": { status: 200, body: LIST } }),
    });
    expect(q.symbol).toBe("MXRF11");
    expect(q.price).toBe(988);
    expect(q.updatedAt).toBeNull();
  });

  it("ticker inexistente na reserva vira erro claro", async () => {
    await expect(
      fetchQuote("ABCD3", { fetchImpl: fake({ "/quote/list": { status: 200, body: { stocks: [] } } }) }),
    ).rejects.toThrow("não encontrado");
  });

  it("valida o formato do ticker antes de chamar a rede", async () => {
    const calls: string[] = [];
    await expect(fetchQuote("PETR", { fetchImpl: fake({}, calls) })).rejects.toBeInstanceOf(BrapiError);
    expect(calls).toHaveLength(0);
  });

  it("429 vira mensagem de limite", async () => {
    await expect(fetchQuote("VALE3", { fetchImpl: fake({ "/v2/stocks/quote": { status: 429, body: {} } }) })).rejects.toThrow("limite");
  });

  it("usa cache por 60 s", async () => {
    const calls: string[] = [];
    const f = fake({ "/v2/stocks/quote": { status: 200, body: V2 } }, calls);
    await fetchQuote("PETR4", { fetchImpl: f });
    await fetchQuote("PETR4", { fetchImpl: f });
    expect(calls).toHaveLength(1);
  });
});

describe("searchTickers", () => {
  it("busca e normaliza", async () => {
    const r = await searchTickers("maxi", { fetchImpl: fake({ "/quote/list?search=maxi": { status: 200, body: LIST } }) });
    expect(r[0]).toEqual({ symbol: "MXRF11", name: "MAXI RENDA FII", type: "fund", sector: null });
  });
  it("consulta curta não chama a rede", async () => {
    const calls: string[] = [];
    expect(await searchTickers("a", { fetchImpl: fake({}, calls) })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
