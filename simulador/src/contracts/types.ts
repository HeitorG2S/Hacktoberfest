// Contratos compartilhados. Todo valor monetário é Cents (inteiro); nunca float.
// Quem implementa um módulo segue estes tipos sem alterá-los (mudança aqui é decisão do orquestrador).

export type Cents = number; // inteiro seguro (Number.isSafeInteger)
export type Priority = "alta" | "media" | "baixa";

export interface Goal {
  id: string;
  name: string;
  target: Cents; // valor desejado (por mês, ou total quando há deadlineMonths)
  saved: Cents; // já guardado
  deadlineMonths: number | null; // null = meta mensal sem prazo
  priority: Priority;
}

export interface Debt {
  id: string;
  name: string;
  balance: Cents;
  minPayment: Cents;
  monthlyRateBps: number; // juros ao mês em pontos-base (1200 = 12% a.m.)
}

export interface Budget {
  income: Cents; // renda líquida mensal
  fixed: Cents; // contas fixas
  variableEssential: Cents; // despesas essenciais variáveis
  debtMinimums: Cents; // pagamento mínimo de dívidas
}

export interface FinancialState {
  budget: Budget;
  goals: Goal[];
  debts: Debt[];
  reserveBalance: Cents; // reserva de emergência já acumulada
}

export interface Allocation {
  goalId: string;
  amount: Cents;
}

export type PlanLabel = "gemma" | "otimizado" | "conservador";

export interface Plan {
  label: PlanLabel;
  allocations: Allocation[];
}

export type ViolationCode =
  | "EXCEDE_DISPONIVEL"
  | "VALOR_NEGATIVO"
  | "META_DESCONHECIDA"
  | "NAO_MULTIPLO_PASSO"
  | "VALOR_INVALIDO";

export interface Violation {
  code: ViolationCode;
  detail: string;
}

export type GoalStatus = "atendida" | "reduzida" | "zerada";

export interface GoalOutcome {
  goalId: string;
  requested: Cents; // quanto a meta pede neste mês
  allocated: Cents;
  status: GoalStatus;
}

export interface PlanEvaluation {
  plan: Plan;
  valid: boolean;
  violations: Violation[];
  total: Cents;
  leftover: Cents; // disponível - total (negativo se inválido)
  score: number; // pontuação do otimizador (adimensional, não é dinheiro)
  perGoal: GoalOutcome[];
}

export type ScenarioType =
  | "alocar_metas"
  | "compra"
  | "meta_com_prazo"
  | "despesa_inesperada"
  | "divida_vs_reserva"
  | "perda_renda"
  | "desconhecido";

// Intenção já validada e convertida para centavos (saída do llm/parse.ts, entrada do motor).
export interface IntentGoal {
  name: string;
  amount: Cents | null;
  deadlineMonths: number | null;
  priority: Priority | null;
}

export interface Intent {
  scenario: ScenarioType;
  goals: IntentGoal[];
  amount: Cents | null; // valor da compra / despesa inesperada
  incomeChangePct: number | null; // ex.: -30 para perda de 30% da renda
  proposedAllocation: { goal: string; amount: Cents }[]; // "plano do Gemma" (pode ser inválido)
  missing: string[];
  source: "api" | "mock"; // de onde veio a interpretação
}

export interface Consequence {
  label: string; // ex.: "Saldo disponível após a compra"
  before: Cents | null;
  after: Cents | null;
  note?: string;
}

export interface SimulationResult {
  scenario: ScenarioType;
  available: Cents; // saldo disponível usado na simulação
  feasible: boolean; // todas as metas cabem integralmente?
  plans: PlanEvaluation[]; // [gemma?, otimizado, conservador]
  consequences: Consequence[];
  explanation: string[]; // frases prontas para a interface
}

// Resultado do adaptador de importação (src/adapters/extrato).
export interface ImportIssue {
  ref: string; // id da transação ou "linha N"
  reason: string;
}

export interface ImportResult {
  state: FinancialState;
  summary: {
    accepted: number;
    rejected: ImportIssue[];
    duplicates: number;
    warnings: ImportIssue[];
    totals: Budget; // como o orçamento foi derivado
  };
}
