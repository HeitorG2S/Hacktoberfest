import { buildPrompt } from "./prompt";
import { parseLlmText } from "./parse";
import { mockInterpret } from "./mock";
import type { Intent } from "../contracts/types";
import type { LlmContext } from "./context";

const DEFAULT_TIMEOUT_MS = 12000; // por tentativa
const TOTAL_BUDGET_MS = 25000; // passou disso, não tenta de novo: a demo não pode travar
const MAX_RETRIES = 3;

function getDefaultMode(): "api" | "mock" {
  return typeof __LLM_MODE__ !== "undefined" ? __LLM_MODE__ : "mock";
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function interpret(
  userText: string,
  goalNames: string[],
  opts?: {
    mode?: "api" | "mock";
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    context?: LlmContext; // resumo do orçamento (só com permissão; ver context.ts)
  }
): Promise<Intent> {
  const mode = opts?.mode ?? getDefaultMode();
  if (mode === "mock") {
    return mockInterpret(userText);
  }

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prompt = buildPrompt(userText, goalNames, opts?.context);
  const url = `/api/llm`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    // Gemma 4 na API do Google: raciocínio mínimo (senão gasta os tokens pensando) e saída JSON.
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "minimal" },
    },
  };

  let lastError: string | null = null;

  const startedAt = Date.now();
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1 && Date.now() - startedAt > TOTAL_BUDGET_MS) break;
    let currentPrompt = prompt;
    if (attempt > 1 && lastError) {
      currentPrompt = `${prompt}\n\nA tentativa anterior falhou na validação: ${lastError}. Corrija e devolva apenas o JSON válido.`;
    }

    const requestBody = {
      ...body,
      contents: [{ role: "user", parts: [{ text: currentPrompt }] }],
    };

    try {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }, timeoutMs, fetchImpl);

      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${response.statusText}`;
        // Erro 5xx da API costuma ser passageiro: espera um pouco antes de tentar de novo.
        if (response.status >= 500 && attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 800));
        continue;
      }

      const data = await response.json();
      const textParts = data.candidates?.[0]?.content?.parts ?? [];
      // Partes com thought: true são raciocínio do modelo, não a resposta.
      const fullText = textParts
        .filter((p: { thought?: boolean }) => !p.thought)
        .map((p: { text?: string }) => p.text ?? "")
        .join("");

      const result = parseLlmText(fullText, "api");
      if (result.ok) {
        return result.intent;
      }
      lastError = result.error;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Erro de rede";
    }
  }

  return mockInterpret(userText);
}