import type { FinancialState } from "../contracts/types";

// Contrato das telas: toda seção recebe o estado e devolve o novo estado inteiro (imutável).
export interface SectionProps {
  state: FinancialState;
  onChange: (next: FinancialState) => void;
}
