import { z } from "zod";

// Formato de importação simfin-import/v1 (documentado em docs/import-format.md).
// Nomes de campo inspirados no modelo de transação do midday-ai (AGPL-3.0, só referência conceitual)
// e nos tipos do SDK pluggy-node (só o formato; sem conexão bancária). Nenhum código foi copiado.
// O schema aqui é permissivo de propósito: o adaptador valida item a item para poder
// aceitar o que é bom, descartar o que é ruim e explicar o porquê.

export const IMPORT_FORMAT = "simfin-import/v1";

export const CATEGORY_SLUGS = [
  "salario",
  "moradia",
  "contas",
  "mercado",
  "transporte",
  "saude",
  "educacao",
  "lazer",
  "divida",
  "outros",
] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

// Como cada categoria entra no Budget. "ignorar" = não compõe o orçamento (ex.: lazer é meta, não custo fixo).
export type BudgetBucket = "income" | "fixed" | "variableEssential" | "debt" | "ignorar";

// Débitos recorrentes (recurring: true) de categorias de custo vão para "fixed" independentemente desta tabela.
export const CATEGORY_BUCKET: Record<CategorySlug, BudgetBucket> = {
  salario: "income",
  moradia: "fixed",
  contas: "fixed",
  educacao: "fixed",
  mercado: "variableEssential",
  transporte: "variableEssential",
  saude: "variableEssential",
  divida: "debt",
  lazer: "ignorar",
  outros: "ignorar",
};

export const ImportFileSchema = z.object({
  format: z.literal(IMPORT_FORMAT),
  currency: z.literal("BRL"),
  referenceMonth: z.string().regex(/^\d{4}-\d{2}$/),
  accounts: z.array(z.unknown()).default([]),
  transactions: z.array(z.unknown()).default([]),
  debts: z.array(z.unknown()).default([]),
  goals: z.array(z.unknown()).default([]),
});

// Item a item (validados individualmente pelo adaptador). Valores em texto "1234.56".
const moneyText = z.string().regex(/^-?\d+(\.\d{1,2})?$/);

export const AccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["BANK", "CREDIT"]),
  subtype: z.enum(["CHECKING_ACCOUNT", "SAVINGS_ACCOUNT", "CREDIT_CARD"]),
  balance: moneyText,
});

export const TransactionSchema = z.object({
  id: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/), // sempre positivo; o sentido vem de `type`
  type: z.enum(["CREDIT", "DEBIT"]),
  method: z.enum(["payment", "card_purchase", "transfer", "other"]).default("other"),
  categorySlug: z.string().optional(), // desconhecida → "outros" com aviso
  status: z.enum(["posted", "pending"]).default("posted"),
  recurring: z.boolean().default(false),
  frequency: z.enum(["monthly"]).nullable().default(null),
});

export const DebtSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  balance: moneyText,
  minPayment: moneyText,
  monthlyRateBps: z.number().int().min(0).max(100000),
});

export const GoalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  target: moneyText,
  saved: moneyText.default("0"),
  deadlineMonths: z.number().int().min(1).nullable().default(null),
  priority: z.enum(["alta", "media", "baixa"]).default("media"),
});

// CSV (só transações): separador ";", cabeçalho obrigatório, valores pt-BR ("1.234,56") ou "1234.56".
export const CSV_COLUMNS = ["date", "description", "amount", "type", "categorySlug", "recurring"] as const;
