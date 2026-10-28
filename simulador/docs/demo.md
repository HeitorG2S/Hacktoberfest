# Roteiro da demonstração (≈ 5 min)

Antes: `npm run dev`, abrir http://localhost:5173, clicar **Restaurar demo**. Plano B: se a API do Google falhar, o app cai sozinho no modo mock (chip "Modo demonstração") e o roteiro continua igual.

1. **Painel (30 s):** renda R$ 2.500 − fixas 1.000 − essenciais 650 − dívidas 250 = **R$ 600 disponíveis**. As metas pedem R$ 700: o card de IA já avisa que faltam R$ 100.
2. **Simulador — pedido equilibrado (1 min):** chip "Quero guardar dinheiro para emergências, comprar um computador e ainda ter um pouco para lazer…".
   - Mostrar "O que o Gemma entendeu" (só interpretação, JSON validado).
   - Mostrar o resultado do motor: "não cabe tudo", faltam R$ 100, o que foi atendido e reduzido.
3. **Cenários — o diferencial (1 min 30 s):** três planos lado a lado: Gemma, otimizado (300/210/90), conservador (300/250/50). Todos verificados pelo mesmo motor.
   - **Mudar a prioridade do Computador para alta** → a distribuição muda ao vivo (computador 250, reserva 290, lazer 60).
   - Ponto para a banca: o LLM não faz conta; se ele propuser algo acima do disponível, o motor marca **Inválido** e diz o excesso.
4. **Simulador — prazo (40 s):** "Quero comprar um computador de R$ 1.800 em seis meses…" → R$ 300/mês pedidos; o plano otimizado dá 300/200/100 e avisa que o computador leva 9 meses em vez de 6.
5. **Simulador — riscos (40 s):** "E se eu perder 30% da minha renda?" → déficit de R$ 150, metas suspensas. "É melhor acelerar a dívida ou montar uma reserva?" → alerta: o mínimo de R$ 250 não cobre os juros de R$ 360 do cartão.
6. **Importar (30 s):** "Carregar exemplo" → resumo do que foi aceito, descartado e por quê → "Usar estes dados".

Mensagem final: o LLM entende, o algoritmo decide, e todo número na tela é verificável por teste (`npm test`).
