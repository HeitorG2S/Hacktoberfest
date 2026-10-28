# Uma contribuição pequena e verificável

Crie um branch a partir do `main`:

```sh
git clone https://github.com/HeitorG2S/Hacktoberfest.git
cd Hacktoberfest
git switch -c exemplo-novo-lancamento
```

Siga a instalação no README. Exercício: acrescente ao `examples/lancamentos-exemplo.csv` um gasto fictício de lazer (por exemplo, `2026-10-20;Cinema;40.00;DEBIT;lazer;false`). Antes de executar, preveja o efeito: lazer sai direto do disponível do mês, então ele deve cair R$ 40. Importe o arquivo em **Importar planilha** (CSV), confira o resumo da importação e o "Disponível no mês" na Visão geral, e explique a diferença. Rode também os testes offline:

```sh
cd simulador
npm test
```

Revise somente sua mudança; não inclua chaves ou dados reais:

```sh
git diff
git add examples/lancamentos-exemplo.csv
git commit -m "docs: acrescenta gasto fictício de lazer ao exemplo"
git push -u origin exemplo-novo-lancamento
```

No GitHub, abra um **pull request** para o `main`. Explique o que mudou, sua previsão e o que verificou.

Regras do código (valem para qualquer contribuição):
- dinheiro é sempre centavos inteiros (`Cents`); conversões só por `simulador/src/engine/money.ts`;
- o modelo não faz contas: todo número vem do motor (`simulador/src/engine/`) e é coberto por teste;
- dado real nunca vai para o repositório, para logs ou para a IA sem a permissão do usuário.

Este projeto partiu do [gemma-hackday-starter](https://github.com/ricard0mat0s/gemma-hackday-starter): mantenha a licença e o crédito à base. Siga as regras anunciadas pela organização sobre quando começar o trabalho do projeto.
