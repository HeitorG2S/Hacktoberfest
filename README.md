# Clareza — painel financeiro (front-end)

**Projeto local:** `sites/painel-financeiro`
**Landing page:** `dist/index.html`
**Painel financeiro:** `dist/dashboard.html`
**Pacote completo da interface:** `painel-financeiro-interface.zip` (extraia e abra `index.html`)
**Site privado:** https://painel-financeiro-com-chat.sert-o-5708.chatgpt.site
**Comparativo dos ícones:** `dist/favicon-options.html`
**GitHub privado:** https://github.com/HeitorG2S/Hacktoberfest

O painel é estático e não possui backend. Os dados de demonstração são fictícios. Importações aceitam CSV UTF-8 ou TSV; registros e perguntas são processados no navegador.

A landing page mantém o vídeo original de apresentação e inclui uma prévia interativa com exemplos fictícios. O painel permite alternar entre fluxo, categorias e saldo, explorar períodos e ajustar o gráfico a perguntas compatíveis com os cálculos locais.

As animações usam GSAP 3.15.0 e Anime.js 4.5.0; os gráficos usam Chart.js 4.6.1. Os bundles ficam em `dist/assets` e são servidos localmente. A origem e as licenças estão registradas em `dist/assets/ANIMATION-LIBRARIES.md`.

A referência visual recebida está em `../../stitch_ai_financial_assistant_interface (1).zip`. O layout mantém verdes esmeralda, superfícies claras e o resumo financeiro em destaque.