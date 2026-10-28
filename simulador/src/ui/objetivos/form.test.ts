import { describe, expect, it } from "vitest";
import { goalToForm, validateGoalForm } from "./form";
import type { Goal, Priority } from "../../contracts/types";

describe("validateGoalForm", () => {
  const existingIds: string[] = ["reserva", "computador", "lazer"];

  it("caso válido", () => {
    const form = {
      name: "Nova Meta",
      target: "1.000,00",
      saved: "200,00",
      deadlineMonths: "6",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.goal.name).toBe("Nova Meta");
      expect(result.goal.target).toBe(100000);
      expect(result.goal.saved).toBe(20000);
      expect(result.goal.deadlineMonths).toBe(6);
      expect(result.goal.priority).toBe("alta");
      expect(result.goal.id).toBe("nova-meta");
    }
  });

  it("nome vazio", () => {
    const form = {
      name: "   ",
      target: "1000",
      saved: "",
      deadlineMonths: "",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBe("Nome é obrigatório");
  });

  it("nome muito longo", () => {
    const form = {
      name: "a".repeat(61),
      target: "1000",
      saved: "",
      deadlineMonths: "",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBe("Nome deve ter no máximo 60 caracteres");
  });

  it("target inválido (abc)", () => {
    const form = {
      name: "Meta",
      target: "abc",
      saved: "",
      deadlineMonths: "",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.target).toBe("Valor desejado inválido");
  });

  it("target zero", () => {
    const form = {
      name: "Meta",
      target: "0",
      saved: "",
      deadlineMonths: "",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.target).toBe("Valor desejado deve ser maior que zero");
  });

  it("target negativo", () => {
    const form = {
      name: "Meta",
      target: "-100",
      saved: "",
      deadlineMonths: "",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.target).toBe("Valor desejado deve ser maior que zero");
  });

  it("saved maior que target", () => {
    const form = {
      name: "Meta",
      target: "500,00",
      saved: "600,00",
      deadlineMonths: "",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.saved).toBe("Valor guardado não pode ser maior que o desejado");
  });

  it("saved negativo", () => {
    const form = {
      name: "Meta",
      target: "1000",
      saved: "-50",
      deadlineMonths: "",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.saved).toBe("Valor guardado não pode ser negativo");
  });

  it("deadlineMonths zero", () => {
    const form = {
      name: "Meta",
      target: "1000",
      saved: "",
      deadlineMonths: "0",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.deadlineMonths).toBe("Prazo deve ser um inteiro entre 1 e 120");
  });

  it("deadlineMonths decimal (1,5)", () => {
    const form = {
      name: "Meta",
      target: "1000",
      saved: "",
      deadlineMonths: "1,5",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.deadlineMonths).toBe("Prazo deve ser um inteiro entre 1 e 120");
  });

  it("deadlineMonths maior que 120", () => {
    const form = {
      name: "Meta",
      target: "1000",
      saved: "",
      deadlineMonths: "121",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.deadlineMonths).toBe("Prazo deve ser um inteiro entre 1 e 120");
  });

  it("deadlineMonths vazio = null", () => {
    const form = {
      name: "Meta Sem Prazo",
      target: "1000",
      saved: "",
      deadlineMonths: "",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.goal.deadlineMonths).toBeNull();
  });

  it("id duplicado vira -2", () => {
    const form = {
      name: "Reserva",
      target: "1000",
      saved: "",
      deadlineMonths: "",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.goal.id).toBe("reserva-2");
  });

  it("id duplicado múltiplas vezes vira -3", () => {
    const form = {
      name: "Reserva",
      target: "1000",
      saved: "",
      deadlineMonths: "",
      priority: "alta" as Priority,
    };
    const withReserva2 = [...existingIds, "reserva-2"];
    const result = validateGoalForm(form, withReserva2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.goal.id).toBe("reserva-3");
  });

  it("acentos no slug (Reserva de emergência → reserva-de-emergencia)", () => {
    const form = {
      name: "Reserva de emergência",
      target: "1000",
      saved: "",
      deadlineMonths: "",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.goal.id).toBe("reserva-de-emergencia");
  });

  it("prioridade inválida", () => {
    const form = {
      name: "Meta",
      target: "1000",
      saved: "",
      deadlineMonths: "",
      priority: "urgente" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.priority).toBe("Prioridade inválida");
  });

  it("saved vazio = 0", () => {
    const form = {
      name: "Meta",
      target: "1000",
      saved: "",
      deadlineMonths: "",
      priority: "alta" as Priority,
    };
    const result = validateGoalForm(form, existingIds);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.goal.saved).toBe(0);
  });
});

describe("goalToForm", () => {
  it("converte goal para form", () => {
    const goal: Goal = {
      id: "teste",
      name: "Meta Teste",
      target: 123456,
      saved: 23456,
      deadlineMonths: 12,
      priority: "media",
    };
    const form = goalToForm(goal);
    expect(form.name).toBe("Meta Teste");
    expect(form.target).toBe("1.234,56");
    expect(form.saved).toBe("234,56");
    expect(form.deadlineMonths).toBe("12");
    expect(form.priority).toBe("media");
  });

  it("saved zero vira string vazia", () => {
    const goal: Goal = {
      id: "teste",
      name: "Meta",
      target: 100000,
      saved: 0,
      deadlineMonths: null,
      priority: "baixa",
    };
    const form = goalToForm(goal);
    expect(form.saved).toBe("");
  });

  it("deadlineMonths null vira string vazia", () => {
    const goal: Goal = {
      id: "teste",
      name: "Meta",
      target: 100000,
      saved: 50000,
      deadlineMonths: null,
      priority: "baixa",
    };
    const form = goalToForm(goal);
    expect(form.deadlineMonths).toBe("");
  });
});