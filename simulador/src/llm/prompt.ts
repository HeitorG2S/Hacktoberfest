import type { LlmContext } from "./context";

export function buildPrompt(userText: string, goalNames: string[], context?: LlmContext): string {
  const goalNamesText = goalNames.length > 0 ? goalNames.join(", ") : "(nenhuma meta cadastrada)";
  const contextText = context
    ? `- Orçamento do usuário (dados de demonstração): disponível por mês ${context.available}; metas: ${context.goals
        .map((g) => `${g.name} pede ${g.requested} (prioridade ${g.priority})`)
        .join("; ")}.
- Em "alocar_metas", proponha em proposed_allocation uma divisão do disponível entre as metas, respeitando as prioridades e SEM ultrapassar o disponível.`
    : "- Você não conhece o orçamento do usuário: deixe proposed_allocation vazio.";

  return `Você é um interpretador de intenções financeiras. Devolva SOMENTE um objeto JSON válido no esquema abaixo, sem texto adicional.

Esquema (RawIntent):
- scenario: um de ["alocar_metas", "compra", "meta_com_prazo", "despesa_inesperada", "divida_vs_reserva", "perda_renda", "desconhecido"]
- goals: array de até 10 objetos com: name (string 1-60), amount (string "1234.56" ou null), deadline_months (int 1-600 ou null), priority ("alta"|"media"|"baixa"|null)
- amount: string "1234.56" ou null (valor da compra/despesa inesperada)
- income_change_pct: int -100 a 100 ou null (ex.: -30 para perda de 30% da renda)
- proposed_allocation: array de até 10 objetos {goal: string, amount: "1234.56"} (divisão sugerida entre metas citadas quando scenario="alocar_metas", senão [])
- missing: array de strings (campos que o usuário não informou)

Regras:
- Valores monetários SEMPRE como texto com ponto decimal ("1800.00"), nunca número.
- Use null quando o usuário não disse o valor.
- NENHUMA conta, NENHUM conselho, NENHUMA decisão de viabilidade.
- O campo proposed_allocation só preenchido quando scenario="alocar_metas"; caso contrário, [].
- deadline_months: só preencha se o usuário citar um prazo em meses; "este mês" ou "agora" → null.
- Metas conhecidas do usuário: ${goalNamesText}
${contextText}

Exemplos:

Entrada: "Quero comprar um computador de R$ 1.800 em seis meses, sem deixar de guardar dinheiro"
Saída:
{
  "scenario": "meta_com_prazo",
  "goals": [
    {"name": "computador", "amount": "1800.00", "deadline_months": 6, "priority": null}
  ],
  "amount": null,
  "income_change_pct": null,
  "proposed_allocation": [],
  "missing": []
}

Entrada (exemplo com outro orçamento: disponível 1000.00; reserva pede 500.00 alta, computador 400.00 media, lazer 300.00 baixa): "Quero guardar dinheiro para emergências, comprar um computador e ainda ter um pouco para lazer. Encontre uma divisão equilibrada sem ultrapassar o que tenho disponível."
Saída:
{
  "scenario": "alocar_metas",
  "goals": [
    {"name": "reserva", "amount": null, "deadline_months": null, "priority": null},
    {"name": "computador", "amount": null, "deadline_months": null, "priority": null},
    {"name": "lazer", "amount": null, "deadline_months": null, "priority": null}
  ],
  "amount": null,
  "income_change_pct": null,
  "proposed_allocation": [
    {"goal": "reserva", "amount": "500.00"},
    {"goal": "computador", "amount": "330.00"},
    {"goal": "lazer", "amount": "170.00"}
  ],
  "missing": []
}

Agora interprete:
"${userText}"`;
}