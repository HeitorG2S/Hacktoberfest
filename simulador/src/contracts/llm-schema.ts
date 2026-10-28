import { z } from "zod";

// Saída bruta que o Gemma 3 deve devolver. Valores monetários vêm como TEXTO em reais com ponto
// decimal ("1800" ou "1800.50"), nunca como número: a conversão para centavos é feita por
// engine/money.ts (parseMoney), sem float. O Gemma só interpreta; não decide viabilidade.

export const MONEY_TEXT = /^\d+(\.\d{1,2})?$/;
const money = z.string().regex(MONEY_TEXT);

export const SCENARIOS = [
  "alocar_metas",
  "compra",
  "meta_com_prazo",
  "despesa_inesperada",
  "divida_vs_reserva",
  "perda_renda",
  "desconhecido",
] as const;

export const RawIntentSchema = z
  .object({
    scenario: z.enum(SCENARIOS),
    goals: z
      .array(
        z.object({
          name: z.string().min(1).max(60),
          amount: money.nullable(),
          deadline_months: z.number().int().min(1).max(600).nullable(),
          priority: z.enum(["alta", "media", "baixa"]).nullable(),
        }),
      )
      .max(10),
    amount: money.nullable(),
    income_change_pct: z.number().int().min(-100).max(100).nullable(),
    proposed_allocation: z.array(z.object({ goal: z.string().min(1), amount: money })).max(10),
    missing: z.array(z.string()).max(10),
  })
  .strict();

export type RawIntent = z.infer<typeof RawIntentSchema>;
