import type { Entry } from "../contracts/types";
import { formatMoney } from "../engine";

// Busca vetorial LOCAL sobre os lançamentos (nada sai do navegador).
// Cada lançamento vira um texto enriquecido ("Gasto de R$ 45,50 em Ifood, categoria lazer, quarta-feira 28/10"),
// tokenizado e expandido com sinônimos; o vetor é TF-IDF e a busca usa similaridade de cosseno.
// Não é um embedding neural: é o equivalente lexical, sem custo e sem enviar dados a terceiros.

// Grupos de sinônimos: um termo de qualquer grupo puxa os demais (linguagem informal → estabelecimento/categoria).
const SYNONYM_GROUPS: string[][] = [
  ["ifood", "rappi", "delivery", "entrega", "pedido", "lanche", "comida", "pizza", "hamburguer", "mcdonalds", "restaurante"],
  ["mercado", "supermercado", "feira", "padaria", "compras", "carrefour", "assai", "atacadao"],
  ["uber", "99", "taxi", "corrida", "transporte", "onibus", "metro", "gasolina", "combustivel", "posto"],
  ["farmacia", "remedio", "drogaria", "saude", "medico", "consulta", "exame"],
  ["netflix", "spotify", "streaming", "assinatura", "disney", "prime"],
  ["cinema", "show", "bar", "lazer", "passeio", "viagem", "ingresso"],
  ["aluguel", "condominio", "moradia", "casa"],
  ["luz", "energia", "agua", "internet", "telefone", "celular", "conta", "contas"],
  ["cartao", "fatura", "emprestimo", "parcela", "divida"],
  ["curso", "escola", "faculdade", "livro", "educacao"],
];

const STOP = new Set(["de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "com", "e", "o", "a", "os", "as", "um", "uma", "para", "por", "gasto", "gastos", "gastei", "r", "categoria"]);
const WEEKDAYS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

export function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function expand(tokens: string[]): string[] {
  const out = [...tokens];
  for (const t of tokens) for (const g of SYNONYM_GROUPS) if (g.includes(t)) out.push(...g.filter((x) => x !== t).map((x) => `~${x}`));
  return out; // sinônimos entram marcados com "~" e peso menor (ver vectorize)
}

export function entryText(e: Entry): string {
  const [y, m, d] = e.date.split("-").map((x) => Number.parseInt(x, 10)) as [number, number, number];
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? "";
  const kind = e.type === "despesa" ? "Gasto" : "Receita";
  return `${kind} de ${formatMoney(e.amount)} em ${e.description}, categoria ${e.categorySlug}, ${weekday} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

type Vec = Map<string, number>;

export interface EntryIndex {
  entries: Entry[];
  vectors: Vec[];
  idf: Map<string, number>;
}

// Termo citado conta 1 por ocorrência; sinônimo conta no máximo 0,5 (não acumula entre grupos).
function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const raw of tokens) if (!raw.startsWith("~")) tf.set(raw, (tf.get(raw) ?? 0) + 1);
  for (const raw of tokens) {
    if (!raw.startsWith("~")) continue;
    const t = raw.slice(1);
    if (!tf.has(t)) tf.set(t, 0.5);
  }
  return tf;
}

function vectorize(tokens: string[], idf: Map<string, number>, fallbackIdf: number): Vec {
  const v: Vec = new Map();
  for (const [t, f] of termFreq(tokens)) v.set(t, f * (idf.get(t) ?? fallbackIdf));
  return v;
}

function cosine(a: Vec, b: Vec): number {
  let dot = 0;
  for (const [t, x] of a) dot += x * (b.get(t) ?? 0);
  const na = Math.sqrt([...a.values()].reduce((s, x) => s + x * x, 0));
  const nb = Math.sqrt([...b.values()].reduce((s, x) => s + x * x, 0));
  return na && nb ? dot / (na * nb) : 0;
}

// Só os campos que descrevem o lançamento entram no vetor (valor e data ficam fora para não "casar" por número).
function indexTokens(e: Entry): string[] {
  return expand(tokenize(`${e.description} ${e.categorySlug}`));
}

export function buildEntryIndex(entries: Entry[]): EntryIndex {
  const docs = entries.map(indexTokens);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.map((x) => x.replace(/^~/, "")))) df.set(t, (df.get(t) ?? 0) + 1);
  const n = Math.max(1, entries.length);
  const idf = new Map([...df].map(([t, c]) => [t, Math.log(1 + n / c)]));
  return { entries, idf, vectors: docs.map((d) => vectorize(d, idf, Math.log(1 + n))) };
}

export function searchEntries(index: EntryIndex, query: string, opts: { k?: number; minScore?: number } = {}): { entry: Entry; score: number }[] {
  const q = vectorize(expand(tokenize(query)), index.idf, Math.log(1 + Math.max(1, index.entries.length)));
  if (q.size === 0) return [];
  return index.entries
    .map((entry, i) => ({ entry, score: cosine(q, index.vectors[i]!) }))
    .filter((r) => r.score >= (opts.minScore ?? 0.15))
    .sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date))
    .slice(0, opts.k ?? 50);
}
