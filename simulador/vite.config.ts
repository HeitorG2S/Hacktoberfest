/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// A chave do Google fica só no servidor de desenvolvimento: o proxy a injeta no cabeçalho
// e o navegador nunca a vê. Sem chave, o app roda em modo mock.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const model = env.GEMMA_MODEL || "gemma-4-26b-a4b-it";
  const apiKey = env.GEMINI_API_KEY ?? "";
  const hasKey = apiKey !== "";
  const llmMode = env.LLM_MODE === "mock" || !hasKey ? "mock" : "api";
  return {
    plugins: [react()],
    define: { __LLM_MODE__: JSON.stringify(llmMode), __LLM_MODEL__: JSON.stringify(model) },
    server: {
      proxy: {
        "/api/llm": {
          target: "https://generativelanguage.googleapis.com",
          changeOrigin: true,
          rewrite: () => `/v1beta/models/${model}:generateContent`,
          headers: (hasKey ? { "x-goog-api-key": apiKey } : {}) as Record<string, string>,
        },
      },
    },
    test: { environment: "node", include: ["src/**/*.test.ts"] },
  };
});
