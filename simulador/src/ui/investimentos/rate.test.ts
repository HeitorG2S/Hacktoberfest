import { describe, expect, it } from "vitest";
import { formatRateBps, parseRatePercent } from "./rate";

describe("parseRatePercent", () => {
  it("parses comma decimal", () => {
    expect(parseRatePercent("10,75")).toBe(1075);
  });

  it("parses dot decimal with percent sign", () => {
    expect(parseRatePercent("10.75%")).toBe(1075);
  });

  it("parses integer", () => {
    expect(parseRatePercent("8")).toBe(800);
  });

  it("parses zero", () => {
    expect(parseRatePercent("0")).toBe(0);
  });

  it("parses with trailing zeros", () => {
    expect(parseRatePercent("10,70")).toBe(1070);
  });

  it("parses with single decimal digit", () => {
    expect(parseRatePercent("10,7")).toBe(1070);
  });

  it("rejects more than 2 decimal places", () => {
    expect(() => parseRatePercent("10,755")).toThrow("taxa inválida");
  });

  it("rejects non-numeric", () => {
    expect(() => parseRatePercent("abc")).toThrow();
  });

  it("rejects negative", () => {
    expect(() => parseRatePercent("-1")).toThrow("taxa não pode ser negativa");
  });

  it("rejects over 1000%", () => {
    expect(() => parseRatePercent("1001")).toThrow("taxa não pode exceder 1000%");
    expect(() => parseRatePercent("1000,01")).toThrow("taxa não pode exceder 1000%");
  });

  it("rejects empty", () => {
    expect(() => parseRatePercent("")).toThrow("taxa vazia");
    expect(() => parseRatePercent("   ")).toThrow("taxa vazia");
    expect(() => parseRatePercent("%")).toThrow("taxa inválida");
  });

  it("handles thousand separators correctly", () => {
    expect(parseRatePercent("1.000,00")).toBe(100000);
    expect(parseRatePercent("1,000.00%")).toBe(100000);
  });
});

describe("formatRateBps", () => {
  it("formats 1075 as 10,75%", () => {
    expect(formatRateBps(1075)).toBe("10,75%");
  });

  it("formats 800 as 8,00%", () => {
    expect(formatRateBps(800)).toBe("8,00%");
  });

  it("formats 0 as 0,00%", () => {
    expect(formatRateBps(0)).toBe("0,00%");
  });

  it("formats 100000 as 1000,00%", () => {
    expect(formatRateBps(100000)).toBe("1000,00%");
  });

  it("formats 1234 as 12,34%", () => {
    expect(formatRateBps(1234)).toBe("12,34%");
  });

  it("rejects negative", () => {
    expect(() => formatRateBps(-1)).toThrow("bps inválido");
  });

  it("rejects over 100000", () => {
    expect(() => formatRateBps(100001)).toThrow("bps inválido");
  });

  it("rejects non-integer", () => {
    expect(() => formatRateBps(10.5)).toThrow("bps inválido");
  });
});