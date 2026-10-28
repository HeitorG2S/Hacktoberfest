# Clareza: painel financeiro e simulador de decisões com Gemma

Registre seus gastos, importe uma planilha e pergunte em linguagem natural: "consigo pedir um iFood de R$ 60 hoje?", "onde invisto o que sobra?", "e se eu perder 30% da renda?". **Gemma interpreta o pedido; um motor determinístico faz todas as contas** e compara planos antes de você decidir. Os dados ficam no navegador; somente a interpretação usa a API externa, e o resumo do seu orçamento só vai para ela se você permitir. Projeto do Hack Day LICA/Unimontes, construído a partir do [gemma-hackday-starter](https://github.com/ricard0mat0s/gemma-hackday-starter) (veja [Créditos](#créditos)).

O repositório tem duas partes:

| Parte | Pasta | O que é |
|---|---|---|
| Site Clareza | `dist/` | Landing page (`dist/index.html`) e painel estático (`dist/dashboard.html`), sem backend. É o que a hospedagem publica (`.openai/hosting.json`). |
| Simulador de decisões | `simulador/` | App React + TypeScript com o agente Gemma, o motor de cálculo, lançamentos, investimentos (Brapi) e o laboratório de cenários. |

## Execute primeiro

Pré-requisitos: Git, Node.js 22 e acesso ao [Google AI Studio](https://aistudio.google.com/apikey). Ambiente verificado: Node.js **22.22.3**. Dentro da pasta deste repositório, no PowerShell:

```powershell
cd simulador
npm ci
Copy-Item .env.example .env
notepad .env
```

Preencha `GEMINI_API_KEY` no `.env` com a chave do projeto **Free Tier** de um membro elegível da equipe. Mantenha `GEMMA_MODEL=gemma-4-26b-a4b-it` e salve. Não publique a chave: ela fica no servidor local do Vite e nunca vai para o navegador.

```powershell
npm run dev
```

No macOS/Linux, os comandos equivalentes são:

```sh
cd simulador
npm ci
cp .env.example .env
# Edite .env no seu editor antes de continuar.
npm run dev
```

Abra o endereço local mostrado no terminal (normalmente http://localhost:5173). O app abre vazio: em **Importar planilha → Carregar exemplo** você carrega o orçamento fictício de [`examples/`](examples/). Sem chave, ele funciona em modo local (mock), com as mesmas contas. O site estático não precisa de instalação: abra `dist/index.html` no navegador.

## Conta, dados e modelo

Fontes consultadas pelo starter em **22/10/2026**: Gemma 4 tem entrada/saída gratuitas na [tabela de preços](https://ai.google.dev/gemini-api/docs/pricing); o [Free Tier](https://ai.google.dev/gemini-api/docs/billing) permite começar sem cartão; há [cotas por projeto](https://ai.google.dev/gemini-api/docs/rate-limits) e [idade mínima de 18 anos; Brasil é atendido](https://ai.google.dev/gemini-api/docs/available-regions). Em **28/10/2026** conferimos que `gemma-4-26b-a4b-it` aparece na listagem de modelos da API e responde a `generateContent` (o `gemma-3-27b-it` não está mais disponível). Gratuidade e disponibilidade podem mudar.

O que vai para o Google: a frase digitada no chat, sempre como **dado** (nunca como instrução). O resumo do orçamento e dos lançamentos só vai se a opção "Enviar resumo do orçamento ao Gemma" estiver marcada, e anonimizado (sem CPF/CNPJ, e-mail ou números de conta); sem ela, a resposta é montada no navegador. Use dados fictícios: no serviço gratuito, conteúdo pode melhorar produtos e ser revisado por humanos; consulte os [termos da API](https://ai.google.dev/gemini-api/terms). Para cotações, o simulador usa a [Brapi](https://brapi.dev) pública, sem token, e envia só o código do ativo (PETR4, MGLU3, VALE3 e ITUB4 com cotação do dia; demais ativos pelo último fechamento).

O [modelo Gemma via Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api) é `gemma-4-26b-a4b-it`, configurável no `.env`. O código deste projeto usa [MIT](LICENSE); Gemma 4 usa [Apache 2.0](https://ai.google.dev/gemma/apache_2), e o serviço tem os termos acima. O conteúdo é informativo: o app não move dinheiro e não recomenda comprar ou vender ativos específicos.

## Onde alterar

- `simulador/src/engine/`: motor de cálculo em centavos inteiros (orçamento, lançamentos do mês, otimização das metas, cenários, projeção de investimento, trilha de sugestões). Nenhum cálculo depende do modelo.
- `simulador/src/llm/`: chamada ao Gemma, prompt e validação do JSON (zod), com tentativas e modo local.
- `simulador/src/rag/`: RAG em 4 etapas (roteamento, recuperação nos dados locais + Brapi, prompt contextualizado, geração com checagem de números).
- `simulador/src/ui/` e `simulador/src/App.tsx`: telas; `simulador/src/theme.css`: visual Clareza.
- `simulador/src/adapters/extrato/`: importação de planilhas (formato em `simulador/docs/import-format.md`).
- `dist/`: site estático Clareza (landing e painel).
- `examples/`: dados fictícios. [CONTRIBUTING.md](CONTRIBUTING.md): exercício e contribuição.

Verificação offline (respostas simuladas, sem chamar a API):

```sh
cd simulador
npm test
```

## O que é original deste projeto

Partimos do starter (Gemma 4 pela Gemini API, saída em JSON validada, revisão humana antes de qualquer compromisso, exportação CSV) e construímos:

- **Motor de decisões** determinístico: disponível do mês com os lançamentos, otimização das metas em passos de R$ 10 por programação dinâmica, plano conservador, validação de todo plano (inclusive o do Gemma), cenários de compra, meta com prazo, despesa inesperada, dívida × reserva e perda de renda.
- **Agente com RAG**: perguntas comuns respondidas sem IA; "posso gastar X hoje?" com limite diário e metas por categoria; busca vetorial local nos lançamentos; trilha de investimento (dívida cara → reserva de emergência → diversificação) explicada pelo Gemma; checagem de que todo número da resposta está nos dados.
- **Lançamentos pelo chat** ("gastei R$ 45 no mercado"), registrados só depois da confirmação do usuário.
- **Investimentos** com cotações da Brapi e projeção de aportes pela taxa informada pelo usuário.
- **Importação** de planilhas (JSON/CSV) com resumo do que foi aceito, descartado e por quê; exportação CSV reimportável e protegida contra fórmulas.
- **Interface** no visual Clareza, com gráficos (Chart.js) e laboratório de cenários lado a lado.

## Créditos

- Base: [gemma-hackday-starter](https://github.com/ricard0mat0s/gemma-hackday-starter) (MIT). Seguimos a estrutura do repositório e as práticas: chave só no ambiente local, Gemma pela Gemini API sem depender do modo estruturado, texto do usuário tratado como dado não confiável, mensagens de erro por código da API, testes offline, dados fictícios e CSV protegido contra fórmulas. O código do simulador é nosso, em TypeScript.
- Site Clareza (`dist/`): animações com GSAP 3.15.0 e Anime.js 4.5.0, gráficos com Chart.js 4.6.1; origem e licenças em `dist/assets/ANIMATION-LIBRARIES.md`. A referência visual recebida está em `../../stitch_ai_financial_assistant_interface (1).zip`.
- Referências conceituais do formato de importação: [midday-ai](https://github.com/midday-ai/midday) (AGPL-3.0) e o SDK [pluggy-node](https://github.com/pluggyai/pluggy-node); nenhum código copiado. Cotações: [Brapi](https://brapi.dev).

## Links do site

- Landing page: `dist/index.html` · Painel: `dist/dashboard.html` · Ícones: `dist/favicon-options.html`
- Pacote da interface: `painel-financeiro-interface.zip` (extraia e abra `index.html`)
- Site privado: https://painel-financeiro-com-chat.sert-o-5708.chatgpt.site
- Projeto local original do site: `sites/painel-financeiro`
