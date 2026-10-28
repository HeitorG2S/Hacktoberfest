// API pública do motor (determinístico; não depende de LLM, interface nem formato de importação).
export { available, monthlyRequest, totalRequested } from "./budget";
export { applyBps, applyPpm, ceilDiv, formatMoney, MoneyError, parseMoney, priceToCents, sum, toMoneyText } from "./money";
export { conservativePlan, DEFAULT_STEP, DEFAULT_WEIGHTS, goalScore, optimize, scoreAllocations } from "./optimizer";
export { applyIntentGoals, explainPlans, gemmaPlan, matchGoal, projectDebt, simulate } from "./scenarios";
export { evaluatePlan } from "./validate";
export { currentMonth, entriesOfMonth, entryBucket, monthSummary, today } from "./month";
export { formatRateBps, monthlyRatePpm, projectInvestment, sharesFor } from "./investment";
export { biggestExpense, categoryBox, dailyAvailableSeries, daysLeftInMonth, fixedPending, investmentGuidance, monthTotals, plannedVsSpent, requestedAfterSpending, spendCheck, spendingByCategory, spentInCategory, totalOf } from "./insights";
