import type { ImportResult } from "../../contracts/types";
import { importJson } from "./json";
import { importCsv } from "./csv";

export function importStatement(raw: string, kind: "json" | "csv", opts?: { referenceMonth?: string }): ImportResult {
  if (kind === "json") {
    return importJson(raw, opts?.referenceMonth);
  }
  return importCsv(raw, opts?.referenceMonth);
}

export { importJson } from "./json";
export { importCsv } from "./csv";
export * from "./normalize";