import type { Goal, Cents } from "../../contracts/types";
import { sum } from "../../engine/money";

export interface GoalOverview {
  active: number;
  done: number;
  missing: Cents;
}

export function goalOverview(goals: Goal[]): GoalOverview {
  let active = 0;
  let done = 0;
  const missingList: Cents[] = [];

  for (const g of goals) {
    if (g.saved >= g.target) {
      done++;
    } else {
      active++;
      missingList.push(g.target - g.saved);
    }
  }

  return {
    active,
    done,
    missing: sum(missingList),
  };
}