# Escolher a figura certa

> **Aviso de lastro:** a correspondência "tipo de conteúdo → tipo de diagrama" é **convenção de
> engenharia**, não resultado experimental. A rodada de pesquisa não encontrou nenhuma evidência
> primária que sustente escolher fluxograma em vez de sequência para tal conteúdo. O que é
> evidência está em `didatica.md` (R1, R4, R5): que haja figura, que ela sinalize o crítico, e que
> o rótulo viva dentro dela. *Qual* figura é ofício.

## A pergunta antes do tipo

Escreva **a afirmação** que a figura faz, numa frase, antes de escolher o tipo. Se a frase não sai, a
figura não deveria existir — é ornamento (R8). A frase vira a legenda.

- ✅ "Todo request de escrita invalida o cache antes de responder."
- ❌ "Arquitetura do sistema."

Uma figura, uma afirmação. Duas afirmações, duas figuras.

## De conteúdo para tipo

| O conteúdo é… | Tipo | Mermaid |
|---|---|---|
| Um caminho com decisões, ramos, retornos | Fluxograma | `flowchart TD` |
| Uma conversa entre partes ao longo do tempo | Sequência | `sequenceDiagram` |
| Algo que **está** em um estado por vez e transita | Máquina de estados | `stateDiagram-v2` |
| Peças que se ligam, sem ordem temporal | Arquitetura / topologia | `flowchart` com `subgraph`, ou `architecture` |
| Contexto → contêiner → componente | C4 (experimental no Mermaid) | `C4Context` |
| Contenção: o que está dentro do quê | Hierarquia | `mindmap`, `treemap` |
| Tabelas, chaves e cardinalidade | Entidade-relacionamento | `erDiagram` |
| Ordem de acontecimentos no calendário | Linha do tempo | `timeline` |
| Volume que se divide ao longo de um caminho | Fluxo proporcional | `sankey` |
| Duas ou mais opções lado a lado | **Tabela HTML**, não diagrama | — |
| Um número e sua variação | **KPI/gráfico**, não diagrama | — |

Duas armadilhas que aparecem sempre:

- **Fluxograma para o que não flui.** Se não há ordem, `subgraph` de arquitetura comunica melhor que
  setas fingindo sequência.
- **Sequência para o que não conversa.** `sequenceDiagram` só ganha quando o *tempo* e o *quem chama
  quem* são o ponto.

## Invariantes de figura

Vêm do `SKILL.md` da skill `visual-explainer` (nicobailon) e da documentação do Mermaid; a skill de
render aplica isso, e o BRIEF precisa **entregar o material** para que ela aplique.

1. **Desenhe o mecanismo, não o nome.** O caminho que um request faz pelo cache diz mais que uma
   caixa escrita "cache".
2. **Toda aresta tem rótulo** — `escreve`, `invalida`, `faz polling a cada 30s`. Seta sem rótulo diz
   apenas "tem alguma relação", que o leitor já supunha.
3. **Marque o crítico** (R4): classe de cor no nó ou aresta **e** a frase adjacente apontando para
   ele. O texto sinaliza mais forte que o gráfico.
4. **Comparar opções é desenhar a diferença** — a aresta que cada uma adiciona ou remove, não dois
   diagramas inteiros para o leitor caçar o delta.
5. **15+ elementos: híbrido.** Um Mermaid pequeno de visão geral + cards de detalhe. Diagrama que
   não cabe na tela não é diagrama, é mapa.
6. **`flowchart TD` por padrão.** `LR` só para 3–4 nós em linha.
7. **Rótulo curto** (R5, teto de proximidade). `<br/>` dentro de rótulo entre aspas; nunca `\n`
   escapado.
8. **A palavra `end` quebra** flowchart e sequência — a própria documentação do Mermaid avisa:
   ponha entre aspas.
9. **Nunca `.node` como classe de página** — o Mermaid usa esse nome internamente.
10. **Figura em `<figure>` com `<figcaption>` que declara a afirmação**, mais `role="img"` e
    `aria-label` no invólucro (não no SVG, que é substituído a cada re-render).

## O portão de renderização

A skill `plannotator-visual-explainer` trata isto como **gate duro**, e o BRIEF deve respeitar:

> "render every diagram with Mermaid 11 in both the light and dark palettes before opening the
> annotation UI… an exception, empty SVG, or error output such as `aria-roledescription="error"` or
> `Syntax error in text` means the explainer is not deliverable."

Diagrama que não renderiza nas duas paletas **não é entregável**. Conserte a sintaxe ou o tema e
rode de novo — não entregue com a figura quebrada e um pedido de desculpas.

## Quando NÃO desenhar

- O conteúdo é uma **definição** ou um fato isolado → R3 manda perguntar antes de responder, não
  desenhar.
- A figura repetiria exatamente o que a tabela ao lado já mostra → R6, escolha uma.
- Você desenharia só para a página "ficar visual" → R8, ilustração sem função é custo.
