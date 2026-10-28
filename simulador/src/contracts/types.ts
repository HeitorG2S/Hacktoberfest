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

// Lançamento do dia a dia, registrado pelo usuário (ou pelo agente, com confirmação) ao longo do mês.
// "despesa" consome o orçamento; "receita" é renda EXTRA, além da renda planejada em Budget.income.
export type EntryType = "despesa" | "receita";
export type EntrySource = "manual" | "agente";

export interface Entry {
  id: string;
  date: string; // AAAA-MM-DD
  description: string;
  amount: Cents; // sempre > 0; o sentido vem de `type`
  type: EntryType;
  categorySlug: string; // um de CATEGORY_SLUGS (contracts/import-format.ts); desconhecida = "outros"
  source: EntrySource;
}

// Taxa de referência para projetar renda fixa. Digitada pelo usuário (o plano grátis da Brapi não traz Selic/CDI).
export interface InvestmentSettings {
  annualRateBps: number; // ex.: 1075 = 10,75% ao ano
  label: string; // de onde veio a taxa, ex.: "CDI informado pelo usuário"
}

export interface FinancialState {
  budget: Budget;
  goals: Goal[];
  debts: Debt[];
  reserveBalance: Cents; // reserva de emergência já acumulada
  entries: Entry[]; // lançamentos do mês (e de meses anteriores)
  investment?: InvestmentSettings;
}

// Resumo do mês calculado pelo motor (engine/month.ts) a partir do orçamento e dos lançamentos.
export interface MonthSummary {
  month: string; // AAAA-MM
  plannedAvailable: Cents; // available(budget)
  spentByBucket: { fixed: Cents; variableEssential: Cents; debt: Cents; discretionary: Cents };
  overspend: Cents; // quanto as despesas planejadas passaram do orçamento (soma por grupo)
  extraIncome: Cents; // receitas lançadas no mês
  effectiveAvailable: Cents; // plannedAvailable + extraIncome - discretionary - overspend
  entriesCount: number;
}

// Projeção de aportes mensais a uma taxa fixa (engine/investment.ts).
export interface InvestmentProjection {
  monthlyContribution: Cents;
  months: number;
  annualRateBps: number;
  monthlyRatePpm: number; // taxa mensal equivalente em partes por milhão
  totalContributed: Cents;
  finalBalance: Cents;
  interest: Cents;
  series: { month: number; balance: Cents }[];
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
  | "pode_gastar"
  | "consulta"
  | "registrar_gasto"
  | "investimento"
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

// Lançamento proposto pelo agente; só entra no estado depois da confirmação do usuário.
export interface ProposedEntry {
  description: string;
  amount: Cents;
  type: EntryType;
  categorySlug: string;
  date: string | null; // null = hoje
}

export interface Intent {
  scenario: ScenarioType;
  entries: ProposedEntry[]; // registrar_gasto
  tickers: string[]; // investimento: ativos citados (ex.: PETR4, MXRF11)
  months: number | null; // investimento: prazo citado
  searchTerm: string | null; // pode_gastar/consulta: estabelecimento ou assunto ("ifood", "mercado")
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

// ---- Brapi e RAG ----

// Cotação normalizada da Brapi (src/brapi/client.ts). Preço já em centavos.
export interface Quote {
  symbol: string;
  name: string;
  price: Cents;
  changePct: number | null; // variação do dia em % (indicador, não dinheiro)
  currency: string;
  updatedAt: string | null; // ISO, horário da cotação informado pela Brapi
  logoUrl: string | null;
}

export interface TickerInfo {
  symbol: string;
  name: string;
  type: string; // "stock" | "fund" | "bdr" | ...
  sector: string | null;
}

// Trecho recuperado para o RAG: cada fato que o agente pode citar.
export interface RetrievedDoc {
  id: string; // ex.: "brapi:PETR4"
  source: "brapi" | "motor";
  title: string;
  text: string; // fatos em português, com os números já formatados
  url: string | null;
  fetchedAt: string; // ISO
  personal?: boolean; // true = dado do usuário (só vai ao LLM externo com a permissão dele)
}

export interface RagAnswer {
  answer: string;
  citations: string[]; // ids de RetrievedDoc usados
  grounded: boolean; // true = passou na checagem de que todo número da resposta está nos documentos
  source: "api" | "mock" | "local"; // local = respondido por template, sem chamar a IA
}

// Passo da trilha de investimento calculada pelo motor (engine/insights.ts). Regras fixas e transparentes.
export interface GuidanceStep {
  id: "sem-sobra" | "divida-cara" | "reserva" | "diversificar";
  title: string;
  detail: string; // já com os valores formatados
  amount: Cents | null; // valor sugerido por mês para este passo
}

// Veredito de "posso gastar X?" calculado pelo motor.
export interface SpendCheck {
  amount: Cents;
  daysLeft: number;
  freeMonth: Cents; // disponível efetivo − o que as metas pedem no mês (pode ser negativo)
  dailyFree: Cents; // freeMonth / dias restantes (0 se negativo)
  effectiveAvailable: Cents;
  verdict: "cabe_no_dia" | "cabe_no_mes" | "reduz_metas" | "nao_cabe";
  overDaily: Cents; // quanto passa do limite do dia (0 se não passa)
  goalCut: Cents; // quanto sai das metas (0 se não sai)
  shortfall: Cents; // quanto falta se não cabe (0 se cabe)
  box: { goalName: string; remaining: Cents; fromBox: Cents } | null; // meta da mesma categoria (ex.: Lazer), consumida primeiro
}
