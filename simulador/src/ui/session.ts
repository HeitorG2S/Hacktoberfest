import { useSyncExternalStore } from "react";
import type { Intent, SimulationResult } from "../contracts/types";

// Última simulação, compartilhada entre as abas Simulador e Cenários (só em memória).
export interface SimulationRun {
  text: string; // pedido do usuário
  intent: Intent; // interpretação (Gemma ou mock)
  result: SimulationResult; // saída do motor
}

let current: SimulationRun | null = null;
const listeners = new Set<() => void>();

export function setLastRun(run: SimulationRun | null): void {
  current = run;
  listeners.forEach((l) => l());
}

export function getLastRun(): SimulationRun | null {
  return current;
}

export function useLastRun(): SimulationRun | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
