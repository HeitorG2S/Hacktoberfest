// API pública do motor (determinístico; não depende de LLM, interface nem formato de importação).
export { available, monthlyRequest, totalRequested } from "./budget";
export { applyBps, ceilDiv, formatMoney, MoneyError, parseMoney, sum, toMoneyText } from "./money";
export { conservativePlan, DEFAULT_STEP, DEFAULT_WEIGHTS, goalScore, optimize, scoreAllocations } from "./optimizer";
export { applyIntentGoals, explainPlans, gemmaPlan, matchGoal, projectDebt, simulate } from "./scenarios";
export { evaluatePlan } from "./validate";
