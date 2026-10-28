import { describe, it, expect, vi } from "vitest";
import { interpret } from "./client";

describe("interpret", () => {
  const goalNames = ["reserva", "computador", "lazer"];

  it("modo mock usa mockInterpret", async () => {
    const intent = await interpret("comprar notebook 1800", goalNames, { mode: "mock" });
    expect(intent.source).toBe("mock");
    expect(intent.scenario).toBe("compra");
  });

  it("modo api: primeira resposta inválida, segunda válida -> usa a segunda (source api)", async () => {
    let callCount = 0;
    const fetchImpl = vi.fn(async (url: string, opts: RequestInit) => {
      callCount++;
      const body = JSON.parse(opts.body as string);
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '{"scenario": "invalido", "goals": []}' }] } }],
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      scenario: "compra",
                      goals: [{ name: "notebook", amount: "1800.00", deadline_months: null, priority: "alta" }],
                      amount: "1800.00",
                      income_change_pct: null,
                      proposed_allocation: [],
                      missing: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response;
    });

    const intent = await interpret("comprar notebook 1800", goalNames, { mode: "api", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(callCount).toBe(2);
    expect(intent.source).toBe("api");
    expect(intent.scenario).toBe("compra");
    expect(intent.goals[0]?.amount).toBe(180000);
  });

  it("modo api: duas respostas inválidas -> fallback para mock", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"scenario": "invalido", "goals": []}' }] } }],
      }),
    })) as unknown as typeof fetch;

    const intent = await interpret("comprar notebook 1800", goalNames, { mode: "api", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(intent.source).toBe("mock");
  });

  it("modo api: fetch rejeita (erro de rede) -> fallback para mock", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network error");
    }) as unknown as typeof fetch;

    const intent = await interpret("comprar notebook 1800", goalNames, { mode: "api", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(intent.source).toBe("mock");
  });

  it("modo api: HTTP não-2xx -> fallback para mock", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const intent = await interpret("comprar notebook 1800", goalNames, { mode: "api", fetchImpl });
    expect(intent.source).toBe("mock");
  });

  it("corpo enviado não contém systemInstruction", async () => {
    const fetchImpl = vi.fn(async (url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string);
      expect(body).not.toHaveProperty("systemInstruction");
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      scenario: "compra",
                      goals: [{ name: "notebook", amount: "1800.00", deadline_months: null, priority: "alta" }],
                      amount: "1800.00",
                      income_change_pct: null,
                      proposed_allocation: [],
                      missing: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as Response;
    });

    await interpret("comprar notebook 1800", goalNames, { mode: "api", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("timeout usa AbortController", async () => {
    const fetchImpl = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"scenario": "compra", "goals": []}' }] } }],
        }),
      } as Response;
    });

    await interpret("comprar notebook 1800", goalNames, { mode: "api", fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10 });
    expect(fetchImpl).toHaveBeenCalled();
  });
});