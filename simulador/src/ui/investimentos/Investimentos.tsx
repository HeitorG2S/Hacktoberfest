import { useState, useEffect, useCallback, useMemo } from "react";
import type { SectionProps } from "../props";
import type { Quote, TickerInfo, InvestmentProjection, FinancialState } from "../../contracts/types";
import { searchTickers, fetchQuote, BrapiError, TICKER_RE } from "../../brapi/client";
import { projectInvestment, sharesFor, monthSummary, currentMonth, formatMoney, parseMoney } from "../../engine";
import { parseRatePercent, formatRateBps } from "./rate";

const DEFAULT_WATCHED = ["PETR4", "ITUB4"];
const DEFAULT_SIMULATION_VALUE = 1000000; // R$ 100,00 em centavos
const DEBOUNCE_MS = 400;

function formatChangePct(pct: number | null): { text: string; positive: boolean | null } {
  if (pct === null) return { text: "—", positive: null };
  const sign = pct >= 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(2)}%`, positive: pct >= 0 };
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "último fechamento";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface WatchedAsset {
  symbol: string;
  quote: Quote | null;
  loading: boolean;
  error: string | null;
}

function createWatchedAsset(symbol: string, overrides: Partial<WatchedAsset> = {}): WatchedAsset {
  return { symbol, quote: null, loading: true, error: null, ...overrides };
}

export function Investimentos(props: SectionProps) {
  const { state, onChange } = props;

  const [watched, setWatched] = useState<string[]>(DEFAULT_WATCHED);
  const [assets, setAssets] = useState<Record<string, WatchedAsset>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TickerInfo[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [simulationValueText, setSimulationValueText] = useState("");
  const [monthlyContributionText, setMonthlyContributionText] = useState("");
  const [monthsText, setMonthsText] = useState("12");
  const [rateText, setRateText] = useState("");
  const [rateLabel, setRateLabel] = useState("");

  const debouncedQuery = useDebounce(searchQuery, DEBOUNCE_MS);

  useEffect(() => {
    const initAssets = Object.fromEntries(watched.map((sym) => [sym, createWatchedAsset(sym)]));
    setAssets(initAssets);
    watched.forEach((sym) => loadQuote(sym));
  }, []);

  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      setSearchLoading(true);
      setSearchError(null);
      searchTickers(debouncedQuery)
        .then((results) => setSearchResults(results))
        .catch((e) => setSearchError(e instanceof BrapiError ? e.message : "erro na busca"))
        .finally(() => setSearchLoading(false));
    } else {
      setSearchResults([]);
      setSearchError(null);
    }
  }, [debouncedQuery]);

  const loadQuote = useCallback((symbol: string) => {
    setAssets((prev) => ({
      ...prev,
      [symbol]: createWatchedAsset(symbol, { loading: true, error: null, quote: null }),
    }));
    fetchQuote(symbol)
      .then((quote) => {
        setAssets((prev) => ({
          ...prev,
          [symbol]: createWatchedAsset(symbol, { loading: false, quote, error: null }),
        }));
      })
      .catch((e) => {
        setAssets((prev) => ({
          ...prev,
          [symbol]: createWatchedAsset(symbol, { loading: false, error: e instanceof BrapiError ? e.message : "erro ao carregar cotação" }),
        }));
      });
  }, []);

  const addWatched = (symbol: string) => {
    const upper = symbol.trim().toUpperCase();
    if (!TICKER_RE.test(upper)) return;
    setWatched((prev) => {
      if (prev.includes(upper)) return prev;
      if (prev.length >= 6) return prev;
      const next = [...prev, upper];
      setTimeout(() => loadQuote(upper), 0);
      return next;
    });
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeWatched = (symbol: string) => {
    setWatched((prev) => prev.filter((s) => s !== symbol));
    setAssets((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
  };

  const simulationValueCents = useMemo(() => {
    if (simulationValueText.trim()) {
      try {
        return parseMoney(simulationValueText);
      } catch {
        return DEFAULT_SIMULATION_VALUE;
      }
    }
    const summary = monthSummary(state, currentMonth());
    return summary.effectiveAvailable > 0 ? summary.effectiveAvailable : DEFAULT_SIMULATION_VALUE;
  }, [simulationValueText, state]);

  const monthlyContributionCents = useMemo(() => {
    if (monthlyContributionText.trim()) {
      try {
        return parseMoney(monthlyContributionText);
      } catch {
        return simulationValueCents;
      }
    }
    return simulationValueCents;
  }, [monthlyContributionText, simulationValueCents]);

  const months = useMemo(() => {
    const n = parseInt(monthsText, 10);
    return Number.isSafeInteger(n) && n >= 1 && n <= 600 ? n : 12;
  }, [monthsText]);

  const rateBps = useMemo(() => {
    if (!rateText.trim()) return null;
    try {
      return parseRatePercent(rateText);
    } catch {
      return null;
    }
  }, [rateText]);

  const projection = useMemo((): InvestmentProjection | null => {
    if (rateBps === null) return null;
    try {
      return projectInvestment(monthlyContributionCents, months, rateBps);
    } catch {
      return null;
    }
  }, [rateBps, monthlyContributionCents, months]);

  const handleSaveRate = () => {
    if (rateBps === null) return;
    onChange({
      ...state,
      investment: { annualRateBps: rateBps, label: rateLabel.trim() || "taxa informada pelo usuário" },
    });
  };


  return (
    <section className="content" style={{ maxWidth: "1200px", margin: "0 auto", padding: "29px 28px 24px" }}>
      <div className="card card-insight" style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <span className="chip warn">Conteúdo informativo</span>
          <span style={{ color: "var(--ink-muted)", fontSize: "13px" }}>
            Não é recomendação de investimento; rentabilidade passada não garante rentabilidade futura. Cotações: Brapi (brapi.dev).
          </span>
          <span className="chip">Brapi · dados públicos</span>
          <span className="muted" style={{ fontSize: "12px", marginLeft: "0.5rem" }}>PETR4, MGLU3, VALE3 e ITUB4 com cotação do dia; demais ativos pelo último fechamento.</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
        <div className="card">
          <h2 style={{ marginBottom: "12px" }}>Ativos</h2>

          <div style={{ display: "grid", gap: "12px" }}>
            <label className="input-wrapper" style={{ display: "grid", gap: "4px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--secondary)" }}>Buscar ativo</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Ex.: PETR4, VALE3, MXRF11..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              {searchLoading && <span className="muted" style={{ fontSize: "12px" }}>Buscando...</span>}
              {searchError && <span className="chip err" style={{ fontSize: "11px" }}>{searchError}</span>}
            </label>

            {searchResults.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {searchResults.map((ticker) => (
                  <button
                    key={ticker.symbol}
                    type="button"
                    className="btn-ghost"
                    style={{ padding: "6px 12px", fontSize: "12px" }}
                    onClick={() => addWatched(ticker.symbol)}
                  >
                    {ticker.symbol} — {ticker.name} <span className="muted">({ticker.type})</span>
                  </button>
                ))}
              </div>
            )}

            <label className="input-wrapper" style={{ display: "grid", gap: "4px", marginTop: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--secondary)" }}>Ou digite o ticker e pressione Enter</span>
              <input
                type="text"
                className="input"
                placeholder="Ticker (ex.: PETR4)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addWatched(e.currentTarget.value);
                }}
                style={{ textTransform: "uppercase" }}
              />
            </label>

            <div style={{ display: "grid", gap: "12px" }}>
              {watched.map((symbol) => {
                const asset = assets[symbol];
                if (!asset) return null;
                const { quote, loading, error } = asset;
                const price = quote?.price ?? 0;
                const shares = sharesFor(simulationValueCents, price);
                const change = formatChangePct(quote?.changePct ?? null);
                return (
                  <div key={symbol} className="card" style={{ padding: "12px", display: "grid", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {quote?.logoUrl && <img src={quote.logoUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6 }} />}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "16px" }}>{symbol}</div>
                          <div className="muted" style={{ fontSize: "12px" }}>{quote?.name || "Carregando..."}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                        onClick={() => removeWatched(symbol)}
                      >
                        Remover
                      </button>
                    </div>

                    {loading && <div className="muted" style={{ fontSize: "13px" }}>Carregando cotação...</div>}

                    {error && (
                      <div className="chip err" style={{ fontSize: "11px", justifyContent: "flex-start" }}>{error}</div>
                    )}

                    {quote && !loading && (
                      <div style={{ display: "grid", gap: "6px" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
                          <span className="metric">{formatMoney(price)}</span>
                          <span
                            style={{
                              fontSize: "14px",
                              fontWeight: 600,
                              color: change.positive === null ? "var(--ink-muted)" : change.positive ? "var(--primary)" : "var(--error)",
                            }}
                          >
                            {change.text}
                          </span>
                          <span className="muted" style={{ fontSize: "12px" }}>
                            {formatDateTime(quote.updatedAt)}
                          </span>
                        </div>
                        <div className="muted" style={{ fontSize: "13px" }}>
                          Com {formatMoney(simulationValueCents)} você compra {shares.shares} cotas (sobra {formatMoney(shares.leftover)})
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {watched.length === 0 && (
                <div className="muted" style={{ textAlign: "center", padding: "20px" }}>
                  Nenhum ativo acompanhado. Busque acima ou digite um ticker.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: "12px" }}>Projeção de aportes (renda fixa)</h2>

          <div style={{ display: "grid", gap: "12px" }}>
            <label style={{ display: "grid", gap: "4px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--secondary)" }}>Valor para simular (R$)</span>
              <input
                type="text"
                className="input"
                placeholder="Ex.: 10000,00"
                value={simulationValueText}
                onChange={(e) => setSimulationValueText(e.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: "4px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--secondary)" }}>Aporte mensal (R$)</span>
              <input
                type="text"
                className="input"
                placeholder="Igual ao valor para simular"
                value={monthlyContributionText}
                onChange={(e) => setMonthlyContributionText(e.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: "4px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--secondary)" }}>Prazo em meses (1–600)</span>
              <input
                type="text"
                className="input"
                value={monthsText}
                onChange={(e) => setMonthsText(e.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: "4px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--secondary)" }}>Taxa de referência ao ano (%)</span>
              <input
                type="text"
                className="input"
                placeholder="Ex.: 10,75 ou 10.75%"
                value={rateText}
                onChange={(e) => setRateText(e.target.value)}
              />
              <span className="muted" style={{ fontSize: "11px" }}>
                {state.investment
                  ? `Taxa salva: ${formatRateBps(state.investment.annualRateBps)} (${state.investment.label})`
                  : "O plano grátis da Brapi não fornece Selic/CDI; informe a taxa que deseja usar como referência."}
              </span>
            </label>

            <label style={{ display: "grid", gap: "4px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--secondary)" }}>Fonte da taxa</span>
              <input
                type="text"
                className="input"
                placeholder="Ex.: CDI do meu banco, Tesouro Selic, poupança..."
                value={rateLabel}
                onChange={(e) => setRateLabel(e.target.value)}
              />
            </label>

            <button className="btn" onClick={handleSaveRate} disabled={rateBps === null} style={{ marginTop: "4px" }}>
              Salvar taxa
            </button>

            {rateBps === null && (
              <div className="card-insight" style={{ marginTop: "8px" }}>
                <span className="muted" style={{ fontSize: "13px" }}>
                  Informe a taxa anual que você quer usar como referência (ex.: o CDI ou a rentabilidade do seu investimento).
                </span>
              </div>
            )}

            {projection && (
              <div style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
                <h3 style={{ margin: "0", fontSize: "15px" }}>Resultado da projeção</h3>
                <div className="grid">
                  <div className="card">
                    <div className="kpi-label">Total aportado</div>
                    <div className="metric num">{formatMoney(projection.totalContributed)}</div>
                  </div>
                  <div className="card">
                    <div className="kpi-label">Saldo projetado</div>
                    <div className="metric num">{formatMoney(projection.finalBalance)}</div>
                  </div>
                  <div className="card">
                    <div className="kpi-label">Rendimento</div>
                    <div className="metric num" style={{ color: "var(--primary)" }}>{formatMoney(projection.interest)}</div>
                  </div>
                </div>

                <div className="card" style={{ padding: "16px" }}>
                  <h4 style={{ margin: "0 0 12px", fontSize: "13px" }}>Evolução do saldo</h4>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      gap: "4px",
                      height: "120px",
                      overflowX: "auto",
                      paddingBottom: "8px",
                    }}
                  >
                    {(() => {
                      const series = projection.series;
                      const step = series.length > 24 ? Math.ceil(series.length / 24) : 1;
                      const maxBalance = Math.max(...series.map((s) => s.balance), 1);
                      return series.filter((_, i) => i % step === 0).map((point) => (
                        <div
                          key={point.month}
                          style={{
                            flex: "1 0 20px",
                            minWidth: "20px",
                            height: `${Math.max((point.balance / maxBalance) * 100, 2)}%`,
                            background: "linear-gradient(180deg, var(--tertiary), var(--primary))",
                            borderRadius: "4px 4px 0 0",
                            position: "relative",
                          }}
                          title={`Mês ${point.month}: ${formatMoney(point.balance)}`}
                        />
                      ));
                    })()}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "11px", color: "var(--ink-muted)" }}>
                    <span>Mês 1</span>
                    <span>Mês {projection.months}</span>
                  </div>
                  <p className="muted" style={{ margin: "12px 0 0", fontSize: "12px" }}>
                    Projeção a taxa constante de {formatRateBps(projection.annualRateBps)} a.a. (fonte: {projection.annualRateBps === state.investment?.annualRateBps && state.investment?.label ? state.investment.label : rateLabel || "informada pelo usuário"}), sem impostos e taxas. Calculada pelo motor do app, não pelo modelo de IA.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}