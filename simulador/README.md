# Simulador de decisões (simulador/)

Instalação, configuração do Gemma, privacidade, créditos e checklist de submissão estão no [README da raiz](../README.md). Aqui fica o resumo técnico.

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

## Agente (RAG em 4 etapas)

1. **Roteamento** (`src/rag/router.ts` + Gemma): perguntas comuns ("quanto tenho?", "maior despesa", "quanto gastei com X?") são respondidas por template, **sem chamar a IA**; o resto o Gemma classifica: posso gastar, consulta, registrar lançamento, investimento ou uma decisão do simulador.
2. **Recuperação** (`src/rag/retrieve.ts`, `src/engine/insights.ts`, `src/rag/vector.ts`): consultas estruturadas no motor (limite do dia, livre no mês sem mexer nas metas, metas-"caixinha" como Lazer, contas fixas pendentes, trilha de investimento) + **busca vetorial local** (TF-IDF com sinônimos, no navegador) sobre os lançamentos, para "delivery" achar iFood/Rappi. Cotações da Brapi pública. O motor já devolve um **rascunho** de resposta (veredito + alternativa).
3. **Prompt contextualizado** (`src/rag/answer.ts`): dados reais calculados + rascunho; regras: nunca inventar números, responder direto, sugerir alternativa, linguagem simples.
4. **Geração**: o Gemma reescreve; uma checagem confere que todo número está nos dados (senão vale o rascunho). Ele **pode sugerir** próximos passos e tipos de aplicação (reserva no Tesouro Selic/CDB com liquidez diária, quitar dívida cara, diversificar com fundos de índice), vindos da trilha do motor; ordem de compra/venda de um ativo específico é descartada.

Também: registrar lançamentos pedidos no chat (só após confirmação) e simular decisões no Laboratório.

## Privacidade

- Nenhum dado financeiro vai a servidor próprio: estado no `localStorage`, importação lida no navegador.
- Ao Gemma vai a frase do usuário. Dados do orçamento e dos lançamentos só vão se o usuário marcar a opção (padrão: não enviar), e anonimizados (sem CPF/CNPJ, e-mail ou números de conta); sem a opção, a resposta é o rascunho do motor, montado no navegador.
- À Brapi vão só os códigos dos ativos.
- A chave da API fica no proxy do Vite (`.env`), nunca no navegador.

## Referências

Muuney (produto fechado, sem API/esquema públicos: usado só como inspiração de produto). Nomes de campos do formato de importação inspirados no modelo de transações do [midday-ai](https://github.com/midday-ai/midday) (AGPL-3.0, só referência conceitual, nenhum código copiado) e nos tipos do SDK [pluggy-node](https://github.com/pluggyai/pluggy-node) (só o formato; sem conexão Open Finance). Design: `docs/DESIGN.md` e o painel Clareza (`dist/` deste repositório) como referência de interface.
