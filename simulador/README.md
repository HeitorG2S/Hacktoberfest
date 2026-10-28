# Simulador Inteligente de Decisões Financeiras

Protótipo web: controle financeiro + **laboratório de decisões**. O usuário descreve a decisão em linguagem natural, o **Gemma** (pesos abertos, `gemma-4-26b-a4b-it` pela API do Google) só interpreta o pedido em JSON validado, e um **motor determinístico** faz toda a matemática, verifica os limites e compara os planos.

## Rodar

```bash
cd app
npm install
cp .env.example .env   # GEMINI_API_KEY (sem ela: modo mock); a Brapi é usada sem token
npm run dev            # http://localhost:5173
npm test               # testes do motor, do cliente LLM, do adaptador e dos formulários
```

## Arquitetura (3 camadas separadas)

| Camada | Pasta | Faz | Não faz |
|---|---|---|---|
| Sistema financeiro | `src/store.ts`, `src/ui/painel`, `src/ui/objetivos`, `src/adapters/extrato` | orçamento, metas, dívidas, importação de extrato | — |
| Gemma (interpretação) | `src/llm` | frase → `Intent` (JSON validado com zod, 3 tentativas, fallback mock) | contas, decisões de viabilidade |
| Motor | `src/engine` | disponível, resumo do mês com lançamentos, otimização, validação de planos, cenários, projeção de investimento | depender do LLM, da interface ou do formato de importação |
| Dados de mercado | `src/brapi` | cotações e busca de ativos na Brapi pública, sem token (PETR4/MGLU3/VALE3/ITUB4 com cotação do dia; demais pelo último fechamento) | dados do usuário |
| RAG | `src/rag` | recupera cotações (Brapi) e fatos do motor, o Gemma redige só com eles, e uma checagem confere que todo número da resposta está nas fontes | calcular ou recomendar investimento |

Contratos compartilhados em `src/contracts/`. Dinheiro é sempre **centavos inteiros** (`Cents`); texto ↔ centavos sem float (`engine/money.ts`).

## Algoritmo

Maximiza `Σ peso(prioridade) · √(progresso)` com pesos alta 3 / média 2 / baixa 1, em passos de R$ 10, por programação dinâmica exata (meta × orçamento). A raiz é côncava: prioriza as metas mais importantes sem zerar as demais. Todo plano (inclusive o do Gemma) passa por `evaluatePlan`, que rejeita o que excede o disponível, valores negativos e metas inexistentes.

Limitação conhecida (achada na revisão independente): pedidos que não são múltiplos de R$ 10 (ex.: R$ 333,34/mês) custam o passo inteiro na busca, então até R$ 10 por meta podem ficar sem alocar no plano otimizado.

Com o arquivo de exemplo da aba Importar (R$ 600 disponíveis, metas somando R$ 700): otimizado 300 / 210 / 90; conservador (prioridade estrita) 300 / 250 / 50.

## Agente

No chat, o Gemma classifica o pedido:
- **Registrar lançamento** ("gastei R$ 45 no mercado", "recebi 300 de um freela"): o agente propõe os lançamentos e **só registra depois que o usuário confirma**.
- **Investimentos** ("como está a PETR4?", "quanto rende R$ 200 por mês em 2 anos?"): RAG com a Brapi; a projeção usa a taxa anual que o usuário informa (o plano grátis da Brapi não traz Selic/CDI). Informativo, não é recomendação.
- **Decisões** (compra, meta com prazo, despesa inesperada, dívida × reserva, perda de renda, divisão entre metas): simuladas pelo motor com o disponível do mês já ajustado pelos lançamentos.

## Privacidade

- Nenhum dado financeiro vai a servidor próprio: estado no `localStorage`, importação lida no navegador.
- Ao Gemma vai a frase do usuário e os nomes das metas; o resumo do orçamento só vai se o usuário marcar a opção (padrão: não enviar).
- À Brapi vão só os códigos dos ativos.
- A chave da API fica no proxy do Vite (`.env`), nunca no navegador.

## Referências

Muuney (produto fechado, sem API/esquema públicos: usado só como inspiração de produto). Nomes de campos do formato de importação inspirados no modelo de transações do [midday-ai](https://github.com/midday-ai/midday) (AGPL-3.0, só referência conceitual, nenhum código copiado) e nos tipos do SDK [pluggy-node](https://github.com/pluggyai/pluggy-node) (só o formato; sem conexão Open Finance). Design: `docs/DESIGN.md` e o painel Clareza (`dist/` deste repositório) como referência de interface.
