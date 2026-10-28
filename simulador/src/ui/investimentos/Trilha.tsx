import type { FinancialState } from "../../contracts/types";
import { currentMonth, formatMoney, investmentGuidance } from "../../engine";

// Trilha de sugestões calculada pelo motor (regras fixas: dívida cara → reserva → diversificar).
export function Trilha({ state }: { state: FinancialState }) {
  const { investable, steps } = investmentGuidance(state, currentMonth());
  return (
    <div className="card-insight" style={{ marginBottom: "16px" }}>
      <h2 style={{ marginBottom: "4px" }}>✦ Sugestões para o seu momento</h2>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: "13px" }}>
        Sobra do mês além das metas: <strong className="num">{formatMoney(investable)}</strong>. Passos calculados pelo app a partir do seu orçamento
        (regras: dívida cara primeiro, depois reserva de 3 meses de despesas essenciais, depois diversificar).
      </p>
      <ol style={{ margin: 0, paddingLeft: "1.2rem", display: "grid", gap: "10px" }}>
        {steps.map((s) => (
          <li key={s.id}>
            <strong>{s.title}</strong>
            <div style={{ fontSize: "13px", color: "var(--ink-muted)" }}>{s.detail}</div>
          </li>
        ))}
      </ol>
      <p className="muted" style={{ margin: "12px 0 0", fontSize: "12px" }}>
        Pergunte no chat ("onde invisto o que sobra?") para o assistente explicar com calma.
      </p>
    </div>
  );
}
