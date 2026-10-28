# Roteiro da demonstração (≈ 6 min)

Antes: `npm run dev`, abrir http://localhost:5173, clicar **Limpar dados** (o app abre vazio). Plano B: se a API do Google falhar, o app cai sozinho no modo mock (chip "Modo mock") e o roteiro continua.

1. **Começo vazio (20 s):** a Visão geral pede os primeiros passos. Aba **Importar → Carregar exemplo → Analisar → Usar estes dados**: renda 2.500, fixas 1.000, essenciais 650, dívidas 250 → **R$ 600 disponíveis**; metas pedem R$ 700. Mostrar o resumo do que foi aceito/descartado.
2. **Agente registra gasto (40 s):** no chat, "Gastei 45,90 no mercado e 12 de uber ontem" → o agente propõe 2 lançamentos (data de ontem resolvida) → **Adicionar**. Aba **Lançamentos**: aparecem com o selo "agente"; mostrar que gasto essencial dentro do planejado não muda o disponível. Lançar à mão "Cinema R$ 40, lazer" → o disponível cai para R$ 560 (lazer sai direto do disponível).
3. **Laboratório (1 min 30 s):** "Divida o que sobrou do mês entre as minhas metas…" → Comparar cenários: plano otimizado × conservador (× Gemma, se a opção de enviar o resumo estiver marcada), todos verificados pelo motor. Mudar a prioridade do Computador → a distribuição muda ao vivo.
4. **Investimentos com RAG (1 min 30 s):** "Como está a PETR4? Quantas cotas compro com R$ 500?" → cotação real da Brapi + cotas calculadas pelo motor; o Gemma só redige e o app confere que todo número está nas fontes (citadas abaixo da resposta). Aba **Investimentos**: informar a taxa de referência (ex.: o CDI do seu banco), ver a projeção; perguntar no chat "Quanto rende guardar R$ 200 por mês durante 2 anos?".
5. **Riscos (40 s):** "E se eu perder 30% da minha renda?" e "É melhor acelerar a dívida ou montar uma reserva?" (alerta: o mínimo de R$ 250 não cobre os juros de R$ 360 do cartão).

Mensagem final: o LLM entende e redige; o motor calcula; a Brapi fornece os dados de mercado; todo número na tela é verificável (`npm test`).
