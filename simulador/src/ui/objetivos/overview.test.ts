import { describe, expect, it } from "vitest";
import { goalOverview } from "./overview";
import type { Goal } from "../../contracts/types";

describe("goalOverview", () => {
  const goals: Goal[] = [
    { id: "g1", name: "Reserva", target: 100000, saved: 30000, deadlineMonths: 6, priority: "alta" },
    { id: "g2", name: "Viagem", target: 50000, saved: 50000, deadlineMonths: 3, priority: "media" },
    { id: "g3", name: "Notebook", target: 80000, saved: 80000, deadlineMonths: null, priority: "baixa" },
    { id: "g4", name: "Curso", target: 20000, saved: 5000, deadlineMonths: 4, priority: "alta" },
  ];

  it("conta metas ativas, concluídas e soma o que falta", () => {
    const result = goalOverview(goals);
    expect(result.active).toBe(2);
    expect(result.done).toBe(2);
    expect(result.missing).toBe(85000);
  });

  it("array vazio retorna zeros", () => {
    const result = goalOverview([]);
    expect(result.active).toBe(0);
    expect(result.done).toBe(0);
    expect(result.missing).toBe(0);
  });

  it("todas concluídas", () => {
    const doneGoals: Goal[] = [
      { id: "g1", name: "A", target: 10000, saved: 10000, deadlineMonths: null, priority: "alta" },
      { id: "g2", name: "B", target: 20000, saved: 25000, deadlineMonths: 2, priority: "media" },
    ];
    const result = goalOverview(doneGoals);
    expect(result.active).toBe(0);
    expect(result.done).toBe(2);
    expect(result.missing).toBe(0);
  });

  it("todas ativas", () => {
    const activeGoals: Goal[] = [
      { id: "g1", name: "A", target: 10000, saved: 3000, deadlineMonths: null, priority: "alta" },
      { id: "g2", name: "B", target: 20000, saved: 5000, deadlineMonths: 2, priority: "media" },
    ];
    const result = goalOverview(activeGoals);
    expect(result.active).toBe(2);
    expect(result.done).toBe(0);
    expect(result.missing).toBe(22000);
  });

  it("saved igual a target conta como concluída", () => {
    const equalGoals: Goal[] = [
      { id: "g1", name: "A", target: 10000, saved: 10000, deadlineMonths: null, priority: "alta" },
    ];
    const result = goalOverview(equalGoals);
    expect(result.active).toBe(0);
    expect(result.done).toBe(1);
    expect(result.missing).toBe(0);
  });
});