import type { Entry } from "../../contracts/types";
import { toMoneyText } from "../../engine/money";

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatShortDate(iso: string): string {
  const parts = iso.split("-");
  const monthIdx = parseInt(parts[1] ?? "1", 10) - 1;
  const day = parseInt(parts[2] ?? "1", 10);
  return `${day} de ${MONTHS_PT[monthIdx] ?? "jan"}`;
}

function escapeCsvField(field: string): string {
  if (field.includes(";") || field.includes("\n") || field.includes("\r") || field.includes('"')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function entriesToCsv(entries: Entry[]): string {
  const header = "date;description;amount;type;categorySlug;recurring";
  const rows = entries.map((e) => {
    const amountText = toMoneyText(e.amount);
    const recurring = "false";
    return [
      e.date,
      escapeCsvField(e.description),
      amountText,
      e.type === "receita" ? "CREDIT" : "DEBIT", // mesmo formato da importação (simfin-import/v1 CSV)
      e.categorySlug,
      recurring,
    ].join(";");
  });
  return [header, ...rows].join("\n");
}

export function downloadCsv(entries: Entry[], filename = "lancamentos.csv"): void {
  const csv = entriesToCsv(entries);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}