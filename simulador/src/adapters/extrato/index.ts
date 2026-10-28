import type { ImportResult } from "../../contracts/types";
import { importJson } from "./json";
import { importCsv } from "./csv";

// Limite de tamanho do arquivo (texto), para não travar o navegador com um arquivo enorme.
export const MAX_IMPORT_CHARS = 2_000_000;

export function importStatement(raw: string, kind: "json" | "csv", opts?: { referenceMonth?: string }): ImportResult {
  if (raw.length > MAX_IMPORT_CHARS) throw new Error("Arquivo grande demais: importe até 2 MB por vez (um mês de lançamentos, por exemplo).");
  if (kind === "json") {
    return importJson(raw, opts?.referenceMonth);
  }
  return importCsv(raw, opts?.referenceMonth);
}

export { importJson } from "./json";
export { importCsv } from "./csv";
export * from "./normalize";