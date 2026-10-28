import { z } from "zod";
import type { RagAnswer, RetrievedDoc } from "../contracts/types";
import { extractJson } from "../llm/parse";

// Geração do RAG: o Gemma responde SÓ com os documentos recuperados, cita os ids e não calcula.
// Depois, uma checagem determinística confere que todo número da resposta aparece nos documentos;
// se não aparecer (alucinação ou conta feita pelo modelo), a resposta é trocada por um texto montado dos documentos.

export const DISCLAIMER = "Conteúdo informativo, não é recomendação de investimento.";
const TIMEOUT_MS = 15000;
const RECOMMENDATION_RE = /\b(recomendo|recomendamos|recomenda-se|sugiro|sugerimos|aconselho|compre|venda|vale a pena (comprar|investir))\b/i;

const AnswerSchema = z.object({ answer: z.string().min(1).max(1500), citations: z.array(z.string()).max(10) });

export function buildRagPrompt(question: string, docs: RetrievedDoc[]): string {
  const docsText = docs.map((d) => `[${d.id}] ${d.text}`).join("\n");
  return `Você é um assistente financeiro. Responda à pergunta do usuário em português, em no máximo 4 frases curtas.

Regras obrigatórias:
- Use SOMENTE os fatos dos documentos abaixo. Não use conhecimento próprio sobre preços, taxas ou empresas.
- Copie os números exatamente como estão nos documentos. NÃO faça contas e NÃO escreva números que não estejam nos documentos.
- Não recomende comprar, vender ou escolher um investimento.
- Se os documentos não respondem à pergunta, diga o que falta.
- Devolva SOMENTE um JSON: {"answer": "texto", "citations": ["ids dos documentos usados"]}.

Documentos:
${docsText || "(nenhum documento recuperado)"}

Pergunta: "${question}"`;
}

// Números da resposta (ignora dígitos colados a letras, como em PETR4).
function numberTokens(text: string): string[] {
  return [...text.matchAll(/(?<![A-Za-z\d])\d+(?:[.,]\d+)*/g)].map((m) => m[0]);
}

const canon = (t: string) => t.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(/[.,]$/, "");

export function isGrounded(answer: string, docs: RetrievedDoc[]): boolean {
  const allowed = new Set(numberTokens(docs.map((d) => `${d.title} ${d.text}`).join(" ")).map(canon));
  return numberTokens(answer).every((t) => allowed.has(canon(t)));
}

export function templateAnswer(docs: RetrievedDoc[], errors: string[] = []): RagAnswer {
  const parts = docs.map((d) => d.text);
  if (errors.length) parts.push(`Não consegui consultar: ${errors.join("; ")}.`);
  if (!parts.length) parts.push("Não encontrei dados para responder. Cite um ativo (ex.: PETR4) ou um valor e prazo para projetar.");
  return { answer: `${parts.join(" ")} ${DISCLAIMER}`, citations: docs.map((d) => d.id), grounded: true, source: "mock" };
}

export async function answerWithDocs(
  question: string,
  docs: RetrievedDoc[],
  opts: { mode?: "api" | "mock"; fetchImpl?: typeof fetch; errors?: string[] } = {},
): Promise<RagAnswer> {
  const mode = opts.mode ?? (typeof __LLM_MODE__ !== "undefined" ? __LLM_MODE__ : "mock");
  const errors = opts.errors ?? [];
  if (mode === "mock" || docs.length === 0) return templateAnswer(docs, errors);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl ?? fetch)("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildRagPrompt(question, docs) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "minimal" } },
      }),
    });
    if (!res.ok) return templateAnswer(docs, errors);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
    const parsed = AnswerSchema.safeParse(extractJson(text));
    if (!parsed.success) return templateAnswer(docs, errors);
    const ids = new Set(docs.map((d) => d.id));
    const citations = parsed.data.citations.filter((c) => ids.has(c));
    if (!isGrounded(parsed.data.answer, docs)) return { ...templateAnswer(docs, errors), grounded: true };
    // Resposta que recomenda comprar/vender é descartada; o aviso vai sempre (o modelo não decide se aparece).
    if (RECOMMENDATION_RE.test(parsed.data.answer)) return templateAnswer(docs, errors);
    const answer = `${parsed.data.answer.replace(DISCLAIMER, "").trim()} ${DISCLAIMER}`;
    return { answer, citations: citations.length ? citations : docs.map((d) => d.id), grounded: true, source: "api" };
  } catch {
    return templateAnswer(docs, errors);
  } finally {
    clearTimeout(timer);
  }
}
