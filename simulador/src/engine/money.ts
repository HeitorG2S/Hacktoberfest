import type { Cents } from "../contracts/types";

// Núcleo de dinheiro: centavos inteiros, conversão de texto sem passar por float.

export class MoneyError extends Error {}

export function assertCents(value: number, what = "valor"): Cents {
  if (!Number.isSafeInteger(value)) throw new MoneyError(`${what} não é um inteiro de centavos: ${value}`);
  return value;
}

// Aceita "1234.56", "1234,56", "1.234,56", "R$ 1.234,56", "-12.5", "1.234" (milhar pt-BR).
// Regra: com vírgula, a vírgula é o decimal e pontos são milhar; sem vírgula, um ponto seguido de
// 1–2 dígitos no fim é decimal e pontos seguidos de grupos de 3 dígitos são milhar.
export function parseMoney(input: string): Cents {
  if (typeof input !== "string") throw new MoneyError("valor ausente");
  let s = input.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).replace(/^R\$/i, "");
  }
  let intPart: string;
  let fracPart = "";
  if (s.includes(",")) {
    const m = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{1,2})$/.exec(s);
    if (!m) throw new MoneyError(`valor inválido: "${input}"`);
    intPart = m[1]!.replace(/\./g, "");
    fracPart = m[2]!;
  } else {
    const dec = /^(\d+)\.(\d{1,2})$/.exec(s);
    const thousands = /^\d{1,3}(?:\.\d{3})+$/.exec(s);
    if (dec) {
      intPart = dec[1]!;
      fracPart = dec[2]!;
    } else if (thousands) {
      intPart = s.replace(/\./g, "");
    } else if (/^\d+$/.test(s)) {
      intPart = s;
    } else {
      throw new MoneyError(`valor inválido: "${input}"`);
    }
  }
  const cents = BigInt(intPart) * 100n + BigInt(fracPart.padEnd(2, "0") || "0");
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new MoneyError(`valor grande demais: "${input}"`);
  const n = Number(cents);
  return negative ? -n : n;
}

export function formatMoney(c: Cents): string {
  assertCents(c);
  const abs = Math.abs(c);
  const reais = Math.trunc(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cents = (abs % 100).toString().padStart(2, "0");
  return `${c < 0 ? "-" : ""}R$ ${reais},${cents}`;
}

// Texto canônico "1234.56" (usado no formato de importação e no JSON do LLM).
export function toMoneyText(c: Cents): string {
  assertCents(c);
  const abs = Math.abs(c);
  return `${c < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${(abs % 100).toString().padStart(2, "0")}`;
}

export function reais(n: number): Cents {
  return assertCents(n * 100, "reais");
}

export function sum(values: Cents[]): Cents {
  return assertCents(values.reduce((a, b) => a + b, 0), "soma");
}

// Divisão inteira com arredondamento para cima (ex.: valor mensal necessário para uma meta).
export function ceilDiv(a: Cents, b: number): Cents {
  if (!Number.isSafeInteger(b) || b <= 0) throw new MoneyError(`divisor inválido: ${b}`);
  assertCents(a);
  return a >= 0 ? Math.floor((a + b - 1) / b) : -Math.floor(-a / b);
}

// Aplica uma taxa em pontos-base com arredondamento meio-para-par (bancário), sem float.
export function applyBps(c: Cents, bps: number): Cents {
  assertCents(c);
  if (!Number.isSafeInteger(bps)) throw new MoneyError(`taxa inválida: ${bps}`);
  const num = BigInt(c) * BigInt(bps);
  const den = 10000n;
  let q = num / den;
  const r = num % den;
  const twice = (r < 0n ? -r : r) * 2n;
  if (twice > den || (twice === den && q % 2n !== 0n)) q += num < 0n ? -1n : 1n;
  return Number(q);
}
