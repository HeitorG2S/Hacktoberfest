import { useState, type ChangeEvent } from "react";
import type { SectionProps } from "../props";
import { importStatement } from "../../adapters/extrato";
import { formatMoney } from "../../engine/money";
import type { ImportResult } from "../../contracts/types";

import demoJsonRaw from "../../adapters/extrato/fixtures/demo.json?raw";
import demoCsvRaw from "../../adapters/extrato/fixtures/demo.csv?raw";

function Importacao(props: SectionProps) {
  const [kind, setKind] = useState<"json" | "csv">("json");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setInput(String(reader.result));
      setError(null);
      setResult(null);
    };
    reader.readAsText(file);
  }

  function loadExample() {
    setInput(kind === "json" ? demoJsonRaw : demoCsvRaw);
    setError(null);
    setResult(null);
  }

  function analyze() {
    if (!input.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = importStatement(input, kind);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  function applyResult() {
    if (result) {
      // Importar atualiza o orçamento. CSV só traz transações: metas, dívidas e reserva atuais ficam.
      // JSON substitui metas e dívidas apenas quando o arquivo traz alguma. Lançamentos e taxa sempre ficam.
      const r = result.state;
      const cur = props.state;
      props.onChange(
        kind === "csv"
          ? { ...cur, budget: r.budget }
          : {
              ...r,
              goals: r.goals.length ? r.goals : cur.goals,
              debts: r.debts.length ? r.debts : cur.debts,
              entries: cur.entries,
              investment: cur.investment,
            },
      );
    }
  }

  return (
    <section className="card">
      <h2>Importar extrato</h2>
      <p className="muted" style={{ marginBottom: "1rem", fontSize: "13px" }}>
        O arquivo é lido só no seu navegador; nada é enviado.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <label>
          <input
            type="radio"
            name="kind"
            value="json"
            checked={kind === "json"}
            onChange={() => setKind("json")}
            style={{ marginRight: "0.25rem" }}
          />
          JSON (simfin-import/v1)
        </label>
        <label>
          <input
            type="radio"
            name="kind"
            value="csv"
            checked={kind === "csv"}
            onChange={() => setKind("csv")}
            style={{ marginRight: "0.25rem" }}
          />
          CSV (transações)
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <label className="input" style={{ flex: 1, minWidth: "200px" }}>
          Arquivo
          <input type="file" accept={kind === "json" ? ".json" : ".csv"} onChange={handleFileChange} />
        </label>
        <button className="btn-ghost" onClick={loadExample} disabled={analyzing}>
          Carregar exemplo
        </button>
        <button className="btn" onClick={analyze} disabled={analyzing || !input.trim()}>
          {analyzing ? "Analisando..." : "Analisar"}
        </button>
      </div>

      <textarea
        className="input"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setError(null);
          setResult(null);
        }}
        placeholder={kind === "json" ? 'Cole o JSON aqui ou use "Carregar exemplo"...' : 'Cole o CSV aqui ou use "Carregar exemplo"...'}
        style={{ fontFamily: "monospace", fontSize: "12px", minHeight: "120px" }}
      />

      {error && (
        <div className="card" style={{ marginTop: "1rem", borderColor: "var(--error)" }}>
          <span className="chip err">Erro no envelope</span>
          <p style={{ marginTop: "0.5rem", color: "var(--error)" }}>{error}</p>
        </div>
      )}

      {result && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>Resumo da importação</h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <span className="chip">Aceitas: {result.summary.accepted}</span>
            <span className="chip err">Descartadas: {result.summary.rejected.length}</span>
            <span className="chip warn">Duplicadas: {result.summary.duplicates}</span>
            <span className="chip warn">Avisos: {result.summary.warnings.length}</span>
          </div>

          {(result.summary.rejected.length > 0 || result.summary.warnings.length > 0) && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h4 style={{ marginBottom: "0.5rem" }}>Detalhes</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Motivo</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.summary.rejected.map((r, i) => (
                    <tr key={i}>
                      <td className="num">{r.ref}</td>
                      <td>{r.reason}</td>
                      <td><span className="chip err">descartada</span></td>
                    </tr>
                  ))}
                  {result.summary.warnings.map((w, i) => (
                    <tr key={i + result.summary.rejected.length}>
                      <td className="num">{w.ref}</td>
                      <td>{w.reason}</td>
                      <td><span className="chip warn">aviso</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>Orçamento derivado</h3>
          <div className="grid">
            <div className="card-insight">
              <div className="kpi-label">Renda (income)</div>
              <div className="metric num">{formatMoney(result.summary.totals.income)}</div>
            </div>
            <div className="card-insight">
              <div className="kpi-label">Fixas (fixed)</div>
              <div className="metric num">{formatMoney(result.summary.totals.fixed)}</div>
            </div>
            <div className="card-insight">
              <div className="kpi-label">Variáveis essenciais</div>
              <div className="metric num">{formatMoney(result.summary.totals.variableEssential)}</div>
            </div>
            <div className="card-insight">
              <div className="kpi-label">Mín. dívidas</div>
              <div className="metric num">{formatMoney(result.summary.totals.debtMinimums)}</div>
            </div>
          </div>

          <div style={{ marginTop: "1rem", textAlign: "right" }}>
            <button className="btn" onClick={applyResult}>Usar estes dados</button>
          </div>
        </div>
      )}
    </section>
  );
}

export { Importacao };