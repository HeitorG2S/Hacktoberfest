import type { LlmContext } from "./context";

export function buildPrompt(userText: string, goalNames: string[], context?: LlmContext, todayIso?: string): string {
  const goalNamesText = goalNames.length > 0 ? goalNames.join(", ") : "(não informadas)";
  const contextText = context
    ? `- Orçamento do usuário (resumo que ele autorizou compartilhar): disponível por mês ${context.available}; metas: ${context.goals
        .map((g) => `${g.name} pede ${g.requested} (prioridade ${g.priority})`)
        .join("; ")}.
- Em "alocar_metas", proponha em proposed_allocation uma divisão do disponível entre as metas, respeitando as prioridades e SEM ultrapassar o disponível.`
    : "- Você não conhece o orçamento do usuário: deixe proposed_allocation vazio.";

  return `Você é um interpretador de intenções financeiras. Devolva SOMENTE um objeto JSON válido no esquema abaixo, sem texto adicional.

Esquema (RawIntent):
- scenario: um de ["registrar_gasto", "investimento", "alocar_metas", "compra", "meta_com_prazo", "despesa_inesperada", "divida_vs_reserva", "perda_renda", "desconhecido"]
  - "registrar_gasto": o usuário CONTA um gasto ou receita que JÁ aconteceu e quer anotar ("gastei", "paguei", "recebi", "anota aí").
  - "investimento": perguntas sobre ações, FIIs, cotações, quanto rende investir, renda fixa.
  - "compra": uma compra que o usuário AINDA está decidindo fazer.
- goals: array de até 10 objetos com: name (string 1-60), amount (string "1234.56" ou null), deadline_months (int 1-600 ou null), priority ("alta"|"media"|"baixa"|null)
- amount: string "1234.56" ou null (valor da compra/despesa inesperada)
- income_change_pct: int -100 a 100 ou null (ex.: -30 para perda de 30% da renda)
- proposed_allocation: array de até 10 objetos {goal: string, amount: "1234.56"} (divisão sugerida entre metas citadas quando scenario="alocar_metas", senão [])
- missing: array de strings (campos que o usuário não informou)
- entries: em "registrar_gasto", lista de lançamentos {description: string curta, amount: "45.90", type: "despesa"|"receita", category: um de [salario, moradia, contas, mercado, transporte, saude, educacao, lazer, divida, outros], date: "AAAA-MM-DD" ou null}; senão []
- tickers: em "investimento", códigos de ativos da B3 citados, em maiúsculas (ex.: "PETR4", "MXRF11"); senão []
- months: em "investimento", prazo em meses citado, ou null

Regras:
- Valores monetários SEMPRE como texto com ponto decimal ("1800.00"), nunca número.
- Use null quando o usuário não disse o valor.
- NENHUMA conta, NENHUM conselho, NENHUMA decisão de viabilidade.
- O campo proposed_allocation só preenchido quando scenario="alocar_metas"; caso contrário, [].
- Data de hoje: ${todayIso ?? "desconhecida"}. Em entries, date = null se for hoje ou sem data; "ontem" ou "dia 5" → calcule a data AAAA-MM-DD.
- Em "registrar_gasto" e "investimento" use amount para o valor citado (em investimento: o aporte); goals e proposed_allocation ficam [].
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

Entrada: "Gastei 45,90 no mercado e 12 de uber"
Saída:
{
  "scenario": "registrar_gasto",
  "goals": [],
  "amount": null,
  "income_change_pct": null,
  "proposed_allocation": [],
  "missing": [],
  "entries": [
    {"description": "Mercado", "amount": "45.90", "type": "despesa", "category": "mercado", "date": null},
    {"description": "Uber", "amount": "12.00", "type": "despesa", "category": "transporte", "date": null}
  ],
  "tickers": [],
  "months": null
}

Entrada: "Quanto rende guardar 200 por mês durante 2 anos? E como está a ITUB4?"
Saída:
{
  "scenario": "investimento",
  "goals": [],
  "amount": "200.00",
  "income_change_pct": null,
  "proposed_allocation": [],
  "missing": [],
  "entries": [],
  "tickers": ["ITUB4"],
  "months": 24
}

Agora interprete:
"${userText}"`;
}