import type { Cents, InvestmentProjection } from "../contracts/types";
import { applyPpm, assertCents } from "./money";

// Taxa mensal equivalente a uma taxa anual: (1 + a)^(1/12) − 1, em partes por milhão.
// A raiz 12 exige ponto flutuante, mas só sobre a TAXA (adimensional), arredondada para inteiro;
// o dinheiro continua em centavos inteiros.
export function monthlyRatePpm(annualRateBps: number): number {
  if (!Number.isSafeInteger(annualRateBps) || annualRateBps < 0 || annualRateBps > 100000) throw new Error(`taxa anual inválida: ${annualRateBps}`);
  return Math.round((Math.pow(1 + annualRateBps / 10000, 1 / 12) - 1) * 1e6);
}

// Aportes no início de cada mês; rendimento no fim do mês, arredondado meio-para-par.
// Projeção ilustrativa a taxa constante: não considera impostos, taxas nem variação da taxa.
export function projectInvestment(monthlyContribution: Cents, months: number, annualRateBps: number): InvestmentProjection {
  assertCents(monthlyContribution, "aporte");
  if (monthlyContribution < 0) throw new Error("aporte negativo");
  if (!Number.isSafeInteger(months) || months < 1 || months > 600) throw new Error(`prazo inválido: ${months}`);
  const ppm = monthlyRatePpm(annualRateBps);
  let balance = 0;
  const series: { month: number; balance: Cents }[] = [];
  for (let m = 1; m <= months; m++) {
    balance += monthlyContribution;
    balance += applyPpm(balance, ppm);
    series.push({ month: m, balance: assertCents(balance, "saldo") });
  }
  const totalContributed = monthlyContribution * months;
  return {
    monthlyContribution,
    months,
    annualRateBps,
    monthlyRatePpm: ppm,
    totalContributed,
    finalBalance: balance,
    interest: balance - totalContributed,
    series,
  };
}

// Quantas cotas inteiras cabem num valor, e quanto sobra (sem frações de cota).
export function sharesFor(amount: Cents, price: Cents): { shares: number; cost: Cents; leftover: Cents } {
  assertCents(amount, "valor");
  assertCents(price, "preço");
  if (price <= 0) return { shares: 0, cost: 0, leftover: amount };
  const shares = Math.floor(amount / price);
  return { shares, cost: shares * price, leftover: amount - shares * price };
}

// "10,75%" a partir de pontos-base (taxa, não dinheiro).
export function formatRateBps(bps: number): string {
  return `${Math.trunc(bps / 100)},${String(Math.abs(bps % 100)).padStart(2, "0")}%`;
}
