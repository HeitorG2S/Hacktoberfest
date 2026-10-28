# Formato de Importação simfin-import/v1

Este documento descreve o formato de arquivo para importação de extratos e dados financeiros no assistente financeiro.

## Visão Geral

O formato `simfin-import/v1` é um envelope JSON que contém:
- Metadados (formato, moeda, mês de referência)
- Contas bancárias
- Transações
- Dívidas
- Metas

Também é suportado um formato CSV simplificado apenas para transações.

**Nota de referência:** Os nomes de campo foram inspirados no modelo de transação do [midday-ai](https://github.com/midday-ai/midday) (AGPL-3.0, apenas referência conceitual) e nos tipos do SDK [pluggy-node](https://github.com/pluggyai/pluggy-node) (apenas o formato; sem conexão bancária/Open Finance). Nenhum código foi copiado.

---

## Envelope JSON

### Estrutura

```json
{
  "format": "simfin-import/v1",
  "currency": "BRL",
  "referenceMonth": "2026-10",
  "accounts": [],
  "transactions": [],
  "debts": [],
  "goals": []
}
```

### Campos do Envelope

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `format` | string | Sim | Deve ser exatamente `"simfin-import/v1"` |
| `currency` | string | Sim | Deve ser `"BRL"` |
| `referenceMonth` | string | Sim | Mês de referência no formato `AAAA-MM` |
| `accounts` | array | Não | Lista de contas (padrão: `[]`) |
| `transactions` | array | Não | Lista de transações (padrão: `[]`) |
| `debts` | array | Não | Lista de dívidas (padrão: `[]`) |
| `goals` | array | Não | Lista de metas (padrão: `[]`) |

---

## Contas (Accounts)

```json
{
  "id": "conta-1",
  "name": "Conta Corrente",
  "type": "BANK",
  "subtype": "CHECKING_ACCOUNT",
  "balance": "5000.00"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | string | Sim | Identificador único |
| `name` | string | Sim | Nome da conta |
| `type` | enum | Sim | `"BANK"` ou `"CREDIT"` |
| `subtype` | enum | Sim | `"CHECKING_ACCOUNT"`, `"SAVINGS_ACCOUNT"` ou `"CREDIT_CARD"` |
| `balance` | string | Sim | Saldo em formato textual (ex.: `"1234.56"` ou `"1.234,56"`) |

**Regra de reserva:** O `reserveBalance` do estado financeiro é a soma dos `balance` das contas com `subtype === "SAVINGS_ACCOUNT"`. Se não houver contas poupança, a reserva é 0.

---

## Transações (Transactions)

```json
{
  "id": "txn-1",
  "accountId": "conta-1",
  "date": "2026-10-15",
  "description": "Supermercado",
  "amount": "150.00",
  "type": "DEBIT",
  "method": "card_purchase",
  "categorySlug": "mercado",
  "status": "posted",
  "recurring": false,
  "frequency": null
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | string | Não | Identificador único (opcional; usado para dedupe) |
| `accountId` | string | Não | Referência à conta |
| `date` | string | Sim | Data no formato `AAAA-MM-DD` |
| `description` | string | Sim | Descrição da transação |
| `amount` | string | Sim | Valor **sempre positivo** em formato textual; o sentido vem de `type` |
| `type` | enum | Sim | `"CREDIT"` (entrada) ou `"DEBIT"` (saída) |
| `method` | enum | Não | `"payment"`, `"card_purchase"`, `"transfer"`, `"other"` (padrão: `"other"`) |
| `categorySlug` | string | Não | Categoria (ver abaixo); desconhecida → `"outros"` com aviso |
| `status` | enum | Não | `"posted"` ou `"pending"` (padrão: `"posted"`) |
| `recurring` | boolean | Não | Se é recorrente (padrão: `false`) |
| `frequency` | enum/null | Não | `"monthly"` ou `null` (padrão: `null`) |

### Categorias Suportadas (CATEGORY_SLUGS)

| Slug | Bucket Orçamentário | Descrição |
|------|---------------------|-----------|
| `salario` | `income` | Renda (salário, proventos) |
| `moradia` | `fixed` | Aluguel, condomínio |
| `contas` | `fixed` | Água, luz, internet, telefone |
| `educacao` | `fixed` | Mensalidades, cursos |
| `mercado` | `variableEssential` | Supermercado, alimentação |
| `transporte` | `variableEssential` | Transporte público, combustível |
| `saude` | `variableEssential` | Farmácia, consultas, convênio |
| `divida` | `debt` | Pagamentos de dívidas/empréstimos |
| `lazer` | `ignorar` | Entretenimento, restaurantes (meta, não custo) |
| `outros` | `ignorar` | Demais (não compõe orçamento) |

**Regras de bucket:**
- `CREDIT` com bucket `income` → soma em `income`
- `CREDIT` com outros buckets → aviso, não entra no orçamento
- `DEBIT` com bucket `debt` → soma em `debtMinimums` (se não houver dívidas no arquivo)
- `DEBIT` com bucket `fixed` OU `recurring: true` (exceto income/debt) → soma em `fixed`
- `DEBIT` com bucket `variableEssential` → soma em `variableEssential`
- `DEBIT` com bucket `ignorar` → não entra (sem aviso)

---

## Dívidas (Debts)

```json
{
  "id": "cartao",
  "name": "Cartão de crédito",
  "balance": "3000.00",
  "minPayment": "250.00",
  "monthlyRateBps": 1200
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | string | Sim | Identificador único |
| `name` | string | Sim | Nome da dívida |
| `balance` | string | Sim | Saldo devedor total |
| `minPayment` | string | Sim | Pagamento mínimo mensal |
| `monthlyRateBps` | number | Sim | Taxa de juros ao mês em pontos-base (ex.: 1200 = 12% a.m.) |

**Validações:**
- `balance` ≥ 0
- `minPayment` ≥ 0
- `minPayment` ≤ `balance`
- `monthlyRateBps` entre 0 e 100000

---

## Metas (Goals)

```json
{
  "id": "reserva",
  "name": "Reserva de emergência",
  "target": "300.00",
  "saved": "0",
  "deadlineMonths": null,
  "priority": "alta"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | string | Sim | Identificador único |
| `name` | string | Sim | Nome da meta |
| `target` | string | Sim | Valor alvo (por mês ou total se houver prazo) |
| `saved` | string | Não | Já guardado (padrão: `"0"`) |
| `deadlineMonths` | number/null | Não | Prazo em meses; `null` = meta mensal sem prazo (padrão: `null`) |
| `priority` | enum | Não | `"alta"`, `"media"`, `"baixa"` (padrão: `"media"`) |

**Validações:**
- `target` > 0
- `saved` ≥ 0
- `saved` ≤ `target`
- `deadlineMonths` ≥ 1 se não nulo

---

## Formato CSV (Apenas Transações)

O CSV importa **somente transações** (não traz contas, dívidas nem metas).

### Especificação

- Separador: `;` (ponto e vírgula)
- Cabeçalho obrigatório (ordem fixa):
  ```
  date;description;amount;type;categorySlug;recurring
  ```
- Valores monetários: pt-BR (`"1.234,56"`) ou ponto (`"1234.56"`)
- `type`: `CREDIT` ou `DEBIT`
- `recurring`: `"true"`, `"false"`, `"sim"`, `"nao"`, `""` (vazio = `false`)
- Sem `id`: dedupe pela chave composta `date|amount|descrição_normalizada`
- `referenceMonth`: usa `opts.referenceMonth` ou o mês mais frequente nas linhas válidas
- Referência de rejeição: `"linha N"` (N contando o cabeçalho como 1)

### Exemplo

```csv
date;description;amount;type;categorySlug;recurring
2026-10-01;Salário;2500.00;CREDIT;salario;false
2026-10-05;Aluguel;800.00;DEBIT;moradia;true
2026-10-10;Contas de luz;200.00;DEBIT;contas;true
2026-10-12;Supermercado;300.00;DEBIT;mercado;false
```

---

## Regras de Validação e Processamento

### Validação do Envelope (falha total → lança Error)

1. JSON quebrado → `Error: "JSON quebrado: ..."`
2. `format` ≠ `"simfin-import/v1"` → `Error: "Formato não suportado: ..."`
3. `currency` ≠ `"BRL"` → `Error: "Moeda não suportada: ..."`
4. CSV: cabeçalho diferente do esperado → `Error: "Cabeçalho CSV inválido: ..."`

### Validação Item a Item (nunca lança; registra em `rejected` ou `warnings`)

#### Transações
| Problema | Resultado | Ref | Motivo |
|----------|-----------|-----|--------|
| Schema inválido | `rejected` | `id` ou `"transação N"` / `"linha N"` | Detalhe do Zod |
| `status === "pending"` | `rejected` | id/ref | `"pendente, não compõe o orçamento"` |
| Data fora de `referenceMonth` | `rejected` | id/ref | `"fora do mês de referência AAAA-MM"` |
| Valor inválido para `parseMoney` | `rejected` | id/ref | `"valor inválido: ..."` |
| `type` ausente/inválido (CSV) | `rejected` | `"linha N"` | `"tipo inválido ou ausente: ..."` |
| Duplicada (mesmo `id`) | `warning` + `duplicates++` | id | `"duplicada de <primeiro_id>"` |
| Duplicada (sem `id`: mesma data/valor/descrição normalizada) | `warning` + `duplicates++` | id/ref | `"duplicada de <primeiro_ref>"` |
| `categorySlug` ausente ou desconhecida | `warning` | id/ref | `"categoria desconhecida 'X' tratada como outros"` |
| `CREDIT` em categoria não-renda | `warning` | id | `"crédito em categoria não-renda (X) ignorado no orçamento"` |

**Chave de dedupe sem `id`:** `date|amount_em_centavos|descrição_normalizada`
- Normalização: trim, minúsculas, remove acentos (NFD), colapsa espaços múltiplos.

#### Contas
- Schema inválido → `rejected`
- Saldo inválido → `rejected`
- Apenas `SAVINGS_ACCOUNT` compõe `reserveBalance` (com aviso)

#### Dívidas
- Schema inválido → `rejected`
- Valores negativos, `minPayment > balance`, `monthlyRateBps` fora do intervalo → `rejected`

#### Metas
- Schema inválido → `rejected`
- `target ≤ 0`, `saved < 0`, `saved > target`, `deadlineMonths < 1` → `rejected`

---

## Derivação do Budget (apenas transações aceitas)

```typescript
income = soma de CREDIT com bucket "income"
fixed = soma de DEBIT com bucket "fixed" OU (recurring=true e não income/debt)
variableEssential = soma de DEBIT com bucket "variableEssential"
debtMinimums = 
  se há dívidas no arquivo: soma de minPayment das dívidas
  senão: soma de DEBIT categoria "divida" + warning "mínimo de dívida estimado pelos pagamentos do mês"
```

- `ignorar` (lazer, outros) → não entra, sem warning
- `debtMinimums` do CSV: sempre vem de transações categoria `divida` (não há dívidas no CSV)

---

## Resultado da Importação (ImportResult)

```typescript
interface ImportResult {
  state: FinancialState; // { budget, goals, debts, reserveBalance }
  summary: {
    accepted: number;
    rejected: ImportIssue[]; // { ref, reason }
    duplicates: number;
    warnings: ImportIssue[]; // { ref, reason }
    totals: Budget; // { income, fixed, variableEssential, debtMinimums }
  };
}
```

---

## Exemplo Completo (demo.json)

```json
{
  "format": "simfin-import/v1",
  "currency": "BRL",
  "referenceMonth": "2026-10",
  "accounts": [
    {
      "id": "conta-corrent",
      "name": "Conta Corrente",
      "type": "BANK",
      "subtype": "CHECKING_ACCOUNT",
      "balance": "5000.00"
    }
  ],
  "transactions": [
    { "id": "txn-1", "accountId": "conta-corrent", "date": "2026-10-01", "description": "Salário", "amount": "2500.00", "type": "CREDIT", "method": "transfer", "categorySlug": "salario", "status": "posted", "recurring": false, "frequency": null },
    { "id": "txn-2", "accountId": "conta-corrent", "date": "2026-10-05", "description": "Aluguel", "amount": "800.00", "type": "DEBIT", "method": "transfer", "categorySlug": "moradia", "status": "posted", "recurring": true, "frequency": "monthly" },
    { "id": "txn-3", "accountId": "conta-corrent", "date": "2026-10-10", "description": "Contas de luz e internet", "amount": "200.00", "type": "DEBIT", "method": "payment", "categorySlug": "contas", "status": "posted", "recurring": true, "frequency": "monthly" },
    { "id": "txn-4", "accountId": "conta-corrent", "date": "2026-10-12", "description": "Supermercado", "amount": "300.00", "type": "DEBIT", "method": "card_purchase", "categorySlug": "mercado", "status": "posted", "recurring": false, "frequency": null },
    { "id": "txn-5", "accountId": "conta-corrent", "date": "2026-10-15", "description": "Transporte público", "amount": "200.00", "type": "DEBIT", "method": "card_purchase", "categorySlug": "transporte", "status": "posted", "recurring": false, "frequency": null },
    { "id": "txn-6", "accountId": "conta-corrent", "date": "2026-10-18", "description": "Farmácia", "amount": "150.00", "type": "DEBIT", "method": "card_purchase", "categorySlug": "saude", "status": "posted", "recurring": false, "frequency": null },
    { "id": "txn-7", "accountId": "conta-corrent", "date": "2026-10-20", "description": "Cinema e jantar", "amount": "100.00", "type": "DEBIT", "method": "card_purchase", "categorySlug": "lazer", "status": "posted", "recurring": false, "frequency": null }
  ],
  "debts": [
    { "id": "cartao", "name": "Cartão de crédito", "balance": "3000.00", "minPayment": "250.00", "monthlyRateBps": 1200 }
  ],
  "goals": [
    { "id": "reserva", "name": "Reserva de emergência", "target": "300.00", "saved": "0", "deadlineMonths": null, "priority": "alta" },
    { "id": "computador", "name": "Computador", "target": "250.00", "saved": "0", "deadlineMonths": null, "priority": "media" },
    { "id": "lazer", "name": "Lazer", "target": "150.00", "saved": "0", "deadlineMonths": null, "priority": "baixa" }
  ]
}
```

**Resultado esperado:**
- `budget`: `{ income: 250000, fixed: 100000, variableEssential: 65000, debtMinimums: 25000 }`
- `goals`: 3 metas (reserva, computador, lazer)
- `debts`: 1 dívida (cartão)
- `reserveBalance`: 0 (sem conta SAVINGS_ACCOUNT)

---

## Privacidade

- O arquivo é lido **apenas no navegador do usuário**; nada é enviado a servidores.
- Nenhuma conexão bancária ou rede é realizada.
- Dados financeiros reais nunca saem do cliente.