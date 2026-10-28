# Simulador Inteligente de Decisões Financeiras

Protótipo web: controle financeiro + **laboratório de decisões**. O usuário descreve a decisão em linguagem natural, o **Gemma** (pesos abertos, `gemma-4-26b-a4b-it` pela API do Google) só interpreta o pedido em JSON validado, e um **motor determinístico** faz toda a matemática, verifica os limites e compara os planos.

## Rodar

```bash
cd app
npm install
cp .env.example .env   # coloque GEMINI_API_KEY; sem chave o app usa o modo mock
npm run dev            # http://localhost:5173
npm test               # testes do motor, do cliente LLM, do adaptador e dos formulários
```

## Arquitetura (3 camadas separadas)

| Camada | Pasta | Faz | Não faz |
|---|---|---|---|
| Sistema financeiro | `src/store.ts`, `src/ui/painel`, `src/ui/objetivos`, `src/adapters/extrato` | orçamento, metas, dívidas, importação de extrato | — |
| Gemma (interpretação) | `src/llm` | frase → `Intent` (JSON validado com zod, 3 tentativas, fallback mock) | contas, decisões de viabilidade |
| Motor | `src/engine` | disponível, otimização, validação de planos, cenários, explicações | depender do LLM, da interface ou do formato de importação |

Contratos compartilhados em `src/contracts/`. Dinheiro é sempre **centavos inteiros** (`Cents`); texto ↔ centavos sem float (`engine/money.ts`).

## Algoritmo

Maximiza `Σ peso(prioridade) · √(progresso)` com pesos alta 3 / média 2 / baixa 1, em passos de R$ 10, por programação dinâmica exata (meta × orçamento). A raiz é côncava: prioriza as metas mais importantes sem zerar as demais. Todo plano (inclusive o do Gemma) passa por `evaluatePlan`, que rejeita o que excede o disponível, valores negativos e metas inexistentes.

Limitação conhecida (achada na revisão independente): pedidos que não são múltiplos de R$ 10 (ex.: R$ 333,34/mês) custam o passo inteiro na busca, então até R$ 10 por meta podem ficar sem alocar no plano otimizado.

Com os dados de demonstração (R$ 600 disponíveis, metas somando R$ 700): otimizado 300 / 210 / 90; conservador (prioridade estrita) 300 / 250 / 50.

## Privacidade

- Nenhum dado financeiro vai a servidor próprio: estado no `localStorage`, importação lida no navegador.
- Ao Gemma vai a frase do usuário e os nomes das metas; o resumo do orçamento só vai com a opção marcada (padrão: só com dados de demonstração).
- A chave da API fica no proxy do Vite (`.env`), nunca no navegador.

## Referências

Muuney (produto fechado, sem API/esquema públicos: usado só como inspiração de produto). Nomes de campos do formato de importação inspirados no modelo de transações do [midday-ai](https://github.com/midday-ai/midday) (AGPL-3.0, só referência conceitual, nenhum código copiado) e nos tipos do SDK [pluggy-node](https://github.com/pluggyai/pluggy-node) (só o formato; sem conexão Open Finance). Design: `docs/DESIGN.md` e o painel Clareza (`dist/` deste repositório) como referência de interface.
