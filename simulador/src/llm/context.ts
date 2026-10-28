import type { FinancialState, Priority } from "../contracts/types";
import { available, monthlyRequest, toMoneyText } from "../engine";

// Resumo do orçamento que pode ir ao Gemma para ele propor uma divisão (o "plano do Gemma").
// Regra do projeto: dado financeiro real não vai a LLM de terceiros. Por isso a interface só envia
// este resumo quando o usuário permite, e o padrão é NÃO enviar.
export interface LlmContext {
  available: string; // "600.00"
  goals: { name: string; requested: string; priority: Priority }[];
}

export function buildLlmContext(state: FinancialState): LlmContext {
  return {
    available: toMoneyText(Math.max(0, available(state.budget))),
    goals: state.goals.map((g) => ({ name: g.name, requested: toMoneyText(monthlyRequest(g)), priority: g.priority })),
  };
}

// O app não traz mais dados fictícios por padrão: tudo é tratado como dado real do usuário,
// e o resumo do orçamento só vai ao Gemma se o usuário marcar a opção.
export function isDemoData(_state: FinancialState): boolean {
  return false;
}
