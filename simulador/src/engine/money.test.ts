import { describe, expect, it } from "vitest";
import { applyBps, ceilDiv, formatMoney, MoneyError, parseMoney, toMoneyText } from "./money";

describe("parseMoney", () => {
  it.each([
    ["1800", 180000], ["1800.5", 180050], ["1800.50", 180050], ["1800,5", 180050],
    ["1.234,56", 123456], ["R$ 1.234,56", 123456], ["1.234", 123400], ["12.345.678,90", 1234567890],
    ["0,01", 1], ["-12.50", -1250], ["-R$ 3,00", -300], [" 600 ", 60000],
  ])("%s → %d", (s, c) => expect(parseMoney(s)).toBe(c));

  it.each(["", "abc", "1.2.3", "12,345", "1,2,3", "1e3", "NaN", "12.345,6.7", "--1"])("rejeita %s", (s) =>
    expect(() => parseMoney(s)).toThrow(MoneyError),
  );

  it("não perde precisão onde float perderia", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("1.15")).toBe(115);
  });
});

describe("formatação", () => {
  it("formata pt-BR", () => {
    expect(formatMoney(123456)).toBe("R$ 1.234,56");
    expect(formatMoney(-5)).toBe("-R$ 0,05");
    expect(formatMoney(60000)).toBe("R$ 600,00");
  });
  it("texto canônico ida e volta", () => {
    for (const c of [0, 1, 99, 100, 123456, -250]) expect(parseMoney(toMoneyText(c))).toBe(c);
  });
});

describe("aritmética", () => {
  it("ceilDiv arredonda para cima", () => {
    expect(ceilDiv(180000, 6)).toBe(30000);
    expect(ceilDiv(100000, 3)).toBe(33334);
  });
  it("applyBps arredonda meio-para-par", () => {
    expect(applyBps(300000, 1200)).toBe(36000);
    expect(applyBps(5, 5000)).toBe(2); // 2,5 → 2
    expect(applyBps(15, 5000)).toBe(8); // 7,5 → 8
    expect(applyBps(-15, 5000)).toBe(-8);
  });
});
