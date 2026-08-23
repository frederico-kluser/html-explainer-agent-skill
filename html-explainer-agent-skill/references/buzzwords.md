# Buzzword: o protocolo

> O pedido que gerou esta regra: *"explique as buzzwords onde forem declaradas"*. Aqui está o como.

## A regra

**Todo termo que o documento introduz é definido na primeira vez em que aparece, em linguagem
simples, no ponto de uso.** Sem exceção para termo que "todo mundo conhece" — quem conhece pula a
definição em meio segundo; quem não conhece, sem ela, para de ler.

## O que conta como buzzword

O style guide de desenvolvedor do Google define jargão como *"the specialized and often figurative
terminology of a specific group to represent a larger concept — for example, camel case, swim lane,
break-glass procedure, or out-of-the-box"*, e inclui também *"vaguely defined or overloaded terms
like solution, support, or workload"*.

Na prática, marque como buzzword:

- **Termo de arte** — `idempotente`, `backpressure`, `sharding`, `circuit breaker`, `CRDT`.
- **Sigla** — `SRI`, `CDN`, `RBAC`, `ELK`, `SLSA`. Toda sigla é buzzword até ser expandida.
- **Nome de produto usado como conceito** — "usa Redis" quando o ponto é *cache distribuído*.
- **Palavra vaga de indústria** — `solução`, `plataforma`, `nativo`, `escalável`, `robusto`. Estas
  quase sempre devem ser **reescritas**, não definidas.
- **Metáfora que virou termo** — `shift left`, `blue-green`, `canary`, `dogfooding`.

## Como definir — as três formas, em ordem de preferência

O Google recomenda, antes de tudo, **escrever ao redor** do jargão: trocar por palavra comum mais
específica sempre que der. Só quando o termo é o termo que a pessoa vai procurar é que ele fica.

1. **Aposto entre parênteses, na primeira ocorrência** — a forma padrão. Exemplos verbatim do guia
   do Google: *"You then move the task to an earlier part of the process (also known as shifting
   left)"* e *"cold standby (a backup or redundant system that's identical to a primary system)"*.

   > O worker é **idempotente** (rodar duas vezes com a mesma entrada produz o mesmo resultado —
   > repetir não estraga nada).

2. **Bloco de pré-treino, antes do diagrama principal** — quando a figura central usa 3+ termos
   novos, nomeie e defina as peças **antes** de desenhar. O princípio de *pretraining* aparece na
   tabela de Mayer com mediana d = 0,78 em 10 testes; a tradução direta disso em regra de prompt foi
   **reprovada 0-3** na verificação, então: faça, porque é barato e coerente com R5, e **não cite
   número**.

3. **Glossário no fim** — só como *complemento* do inline, nunca no lugar dele. Mandar o leitor
   rolar até o fim para entender a frase que ele está lendo é split-attention (R5) na forma mais
   pura.

## Como é uma boa definição

- **Uma frase, até ~20 palavras.** Passou disso, é uma seção, não uma definição.
- **Diz o que a coisa FAZ, não de que família ela é.** ❌ "é um padrão de resiliência" ✅ "para de
  chamar o serviço quebrado por 30s em vez de insistir e derrubar o resto".
- **Sem definir com outra buzzword.** Se a definição introduz um termo novo, você adiou o problema.
- **Concreta antes de abstrata.** O exemplo mínimo antes da regra geral. (OFÍCIO — sem lastro
  meta-analítico nesta rodada.)
- **A sigla expande na primeira aparição**: `SRI` → "Subresource Integrity (o hash que o navegador
  confere antes de executar o script do CDN)".

## No BRIEF

O BRIEF DIDÁTICO carrega a lista fechada. Nada de "definir conforme necessário":

```
## Buzzwords
| Termo | Onde aparece primeiro | Definição (≤20 palavras) |
|---|---|---|
| idempotente | seção "O worker" | rodar duas vezes com a mesma entrada dá o mesmo resultado |
| backpressure | figura 2 | quando o consumidor pede ao produtor para desacelerar |
```

## O gate

Antes de entregar: **varra o documento pronto e confira que todo termo da tabela está definido na
primeira ocorrência**. Um termo declarado e não definido é o defeito que esta skill existe para não
cometer.

E o inverso também é defeito: **definição repetida**. Definiu na seção 1, não redefina na 3 — isso
é redundância (R6), que não compra nada.
