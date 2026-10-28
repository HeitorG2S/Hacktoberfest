import type { ScenarioType, Priority } from "../../contracts/types";

export const SCENARIO_LABEL: Record<ScenarioType, string> = {
  alocar_metas: "Dividir entre metas",
  compra: "Compra única",
  meta_com_prazo: "Meta com prazo",
  despesa_inesperada: "Despesa inesperada",
  divida_vs_reserva: "Dívida vs. reserva",
  perda_renda: "Perda de renda",
  desconhecido: "Não identificado",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export function scenarioLabel(scenario: ScenarioType): string {
  return SCENARIO_LABEL[scenario] ?? scenario;
}

export function priorityLabel(priority: Priority): string {
  return PRIORITY_LABEL[priority] ?? priority;
}