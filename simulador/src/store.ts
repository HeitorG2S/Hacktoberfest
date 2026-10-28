import { useEffect, useState } from "react";
import type { FinancialState } from "./contracts/types";
import { DEMO_STATE } from "./demo";

// Estado do app no localStorage do navegador (nenhum servidor, nenhum log).
const KEY = "simfin:state:v1";

function load(): FinancialState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as FinancialState;
  } catch {
    /* armazenamento indisponível: usa a demo */
  }
  return DEMO_STATE;
}

export function useFinancialState(): [FinancialState, (s: FinancialState) => void, () => void] {
  const [state, setState] = useState<FinancialState>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignora */
    }
  }, [state]);
  return [state, setState, () => setState(DEMO_STATE)];
}
