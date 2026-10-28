import { formatRateBps as engineFormatRateBps } from "../../engine";
// Lógica pura de parsing/formatação de taxa percentual (bps).
// Trata tudo como texto; sem operações de ponto flutuante em dinheiro.

export function parseRatePercent(text: string): number {
  const s = text.trim();
  if (!s) throw new Error("taxa vazia");

  let hasPercent = false;
  let working = s;
  if (working.endsWith("%")) {
    hasPercent = true;
    working = working.slice(0, -1).trim();
  }

  if (!working) throw new Error("taxa inválida");

  const neg = /^-/.test(working);
  if (neg) throw new Error("taxa não pode ser negativa");

  let intPart = "";
  let fracPart = "";

  if (working.includes(",") && working.includes(".")) {
    const lastComma = working.lastIndexOf(",");
    const lastDot = working.lastIndexOf(".");
    if (lastComma > lastDot) {
      intPart = working.slice(0, lastComma).replace(/\./g, "");
      fracPart = working.slice(lastComma + 1);
    } else {
      intPart = working.slice(0, lastDot).replace(/,/g, "");
      fracPart = working.slice(lastDot + 1);
    }
  } else if (working.includes(",")) {
    const parts = working.split(",");
    if (parts.length !== 2) throw new Error("taxa inválida");
    intPart = parts[0]!.replace(/\./g, "");
    fracPart = parts[1]!;
  } else if (working.includes(".")) {
    const parts = working.split(".");
    if (parts.length !== 2) throw new Error("taxa inválida");
    intPart = parts[0]!;
    fracPart = parts[1]!;
  } else {
    intPart = working;
    fracPart = "";
  }

  if (!/^\d+$/.test(intPart)) throw new Error("taxa inválida");
  if (fracPart && !/^\d+$/.test(fracPart)) throw new Error("taxa inválida");
  if (fracPart.length > 2) throw new Error("taxa inválida");

  const intVal = parseInt(intPart, 10);
  if (intVal > 1000) throw new Error("taxa não pode exceder 1000%");

  let fracDigits = fracPart.slice(0, 2).padEnd(2, "0");
  const fracVal = parseInt(fracDigits, 10);

  const bps = intVal * 100 + fracVal;

  if (bps > 100000) throw new Error("taxa não pode exceder 1000%");

  return bps;
}

// Formatação única no motor; aqui só a validação extra da tela.
export function formatRateBps(bps: number): string {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 100000) {
    throw new Error("bps inválido");
  }
  return engineFormatRateBps(bps);
}