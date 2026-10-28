import type { FinancialState } from "./contracts/types";

// Dados de demonstração fictícios (os mesmos de adapters/extrato/fixtures/demo.json).
// Disponível = 2500 - 1000 - 650 - 250 = R$ 600; metas somam R$ 700.
export const DEMO_STATE: FinancialState = {
  budget: { income: 250000, fixed: 100000, variableEssential: 65000, debtMinimums: 25000 },
  goals: [
    { id: "reserva", name: "Reserva de emergência", target: 30000, saved: 0, deadlineMonths: null, priority: "alta" },
    { id: "computador", name: "Computador", target: 25000, saved: 0, deadlineMonths: null, priority: "media" },
    { id: "lazer", name: "Lazer", target: 15000, saved: 0, deadlineMonths: null, priority: "baixa" },
  ],
  debts: [{ id: "cartao", name: "Cartão de crédito", balance: 300000, minPayment: 25000, monthlyRateBps: 1200 }],
  reserveBalance: 0,
};
