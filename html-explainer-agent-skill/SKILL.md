---
name: html-explainer-agent-skill
description: >-
  Explicar, documentar ou demonstrar algo entregando UM arquivo .html com o conteúdo
  separado em ABAS (tabs), tema escuro, Bootstrap 5 por CDN, destaque de sintaxe
  automático e botão de copiar em cada bloco de código — em vez de responder com
  Markdown, README ou .md solto. Use ao pedir "explica isso", "monta um documento",
  "faz um relatório/guia/tutorial/comparativo/apresentação", "documenta essa API",
  "me manda um HTML", "prefiro em abas", "sem markdown" — e sempre que a resposta
  tiver mais de um eixo (visão geral × código × armadilhas, antes × depois, por
  linguagem, por ambiente) e couber melhor em abas do que em rolagem infinita.
  Cobre o template pronto, o markup ARIA correto de nav-tabs, deep-link da aba pela
  URL, highlight.js/Prism por CDN, copiar-para-área-de-transferência com fallback
  para file://, SRI, e um linter que valida o HTML gerado. NÃO use para páginas de
  produto, app React, site com build/npm, ou quando o destino é um repositório que
  espera Markdown (README, docs/, wiki).
license: MIT
metadata:
  version: "1.0.0"
  requires: "Nada. Zero dependência local — o HTML puxa tudo de CDN. Os scripts opcionais usam Node ≥ 18."
  last-reviewed: "2026-07-29"
---

# Um arquivo, abas, tema escuro

> O entregável desta skill é **um único `.html`** que a pessoa salva, manda por anexo, abre com
> duplo clique e lê offline — sem servidor, sem `npm install`, sem pasta de assets. Todo o visual
> vem do Bootstrap 5 por CDN; o conteúdo vive em abas; o código sai destacado e com botão de copiar.
>
> A razão de existir: Markdown empilha tudo numa coluna infinita. Quando a explicação tem mais de
> um eixo — a visão geral, o código, o passo a passo, as armadilhas, cada linguagem, cada ambiente —
> o leitor tem que rolar procurando. **Aba é o índice que não some da tela.**

## Quando usar

Sempre que o pedido for **explicar / documentar / demonstrar / comparar** algo para um humano ler, e
a resposta for maior que alguns parágrafos. Gatilhos diretos: "faz um documento", "monta um guia",
"me explica isso direito", "gera um HTML", "quero em abas", "não quero markdown", "manda um
relatório", "documenta essa API/esse fluxo/essa decisão".

**Não serve para:** página de produto ou landing, aplicação com estado (isso é React/Vue), site com
build, e o caso em que o arquivo vai virar `README.md` ou entrar em `docs/` de um repositório — lá o
formato esperado é Markdown mesmo. Na dúvida entre `.md` e `.html`: se é para **ler**, HTML; se é
para **versionar e revisar em PR**, Markdown.

## O procedimento — nesta ordem

**1. Copie o template. Não escreva do zero.**

```bash
node ~/.claude/skills/html-explainer-agent-skill/scripts/new-doc.mjs "Título do documento" ./saida.html
```

Ou simplesmente leia `assets/template.html` e reproduza. O template já traz: `<html
data-bs-theme="dark">`, as tags de CDN com SRI conferido, o CSS mínimo, a estrutura de abas com ARIA
correta e o bloco `<script>` do runtime (highlight + copiar + deep-link). **Esse `<script>` final é
copiado inteiro e não se edita** — cada linha dele existe por causa de uma armadilha documentada em
`references/pitfalls.md`.

**2. Decida as abas ANTES de escrever.** Esta é a única decisão de design que importa aqui, e é de
conteúdo, não de código. Ver "Como fatiar em abas" abaixo.

**3. Escreva o conteúdo dentro dos `.tab-pane`,** usando componentes do Bootstrap — nunca CSS novo.
Catálogo pronto para documentação técnica em `references/components.md`.

**4. Rode o linter antes de entregar.** Ele pega o que o olho não pega: par ARIA quebrado, duas abas
ativas, `<` não escapado dentro de `<code>`, bloco de código sem linguagem declarada, link `http://`.

```bash
node ~/.claude/skills/html-explainer-agent-skill/scripts/check-doc.mjs ./saida.html
```

**5. Abra o arquivo e olhe.** `xdg-open saida.html`. Se você não abriu, não terminou.

## Como fatiar em abas

Aba boa é **eixo paralelo**: as fatias respondem à mesma pergunta de ângulos diferentes, e o leitor
escolhe *um*. Aba ruim é **sequência**: passo 1, passo 2, passo 3 — isso é rolagem, não aba, porque
o leitor quer os três em ordem.

| Fatie por | Quando | Exemplo de abas |
|---|---|---|
| **Profundidade** | O leitor médio quer a resposta; alguns querem o porquê | `Resposta` · `Como funciona` · `Referência completa` |
| **Papel** | Públicos diferentes leem partes diferentes | `Para quem usa` · `Para quem integra` · `Para quem opera` |
| **Alternativa** | O ponto é comparar | `Opção A` · `Opção B` · `Trade-offs` |
| **Ambiente/linguagem** | Mesmo conteúdo, sintaxe diferente | `curl` · `Python` · `TypeScript` |
| **Momento** | Migração, refactor, antes/depois | `Como era` · `Como fica` · `Como migrar` |

Regras de bolso:

- **3 a 6 abas.** Menos que 3, use seções com `<h2>`. Mais que 6, agrupe — ou troque para
  `nav-pills` empilhado à esquerda (`.flex-column`), que aguenta mais itens.
- **A primeira aba responde a pergunta.** Ninguém deve precisar clicar para saber a conclusão.
- **Rótulo curto e concreto**: `Armadilhas`, não `Considerações adicionais importantes`.
- **Nenhuma aba pode ficar vazia ou quase.** Duas linhas soltas viram um `<div class="alert">` na
  aba vizinha.
- **Nada crítico só dentro de uma aba escondida.** Aviso de segurança, pré-requisito e "isso apaga
  seu banco" ficam fora das abas, no topo.

## Regras duras

1. **Um arquivo. Sempre.** Zero `.css`, `.js` ou imagem ao lado. Imagem entra como `data:` URI ou
   SVG inline; ícone vem do Bootstrap Icons por CDN.
2. **Nada de npm, bundler ou build.** Só `<link>` e `<script src>` apontando para CDN, com
   `integrity` + `crossorigin` (SRI). URLs e hashes conferidos em `references/cdn.md`.
3. **Escuro e só escuro.** `<html data-bs-theme="dark">` + `<meta name="color-scheme"
   content="dark">`. Sem alternador de tema, sem `prefers-color-scheme`, sem variante clara — o
   pedido é legibilidade, e um tema é mais fácil de acertar que dois.
4. **Versão travada na URL do CDN.** `bootstrap@5.3.8`, nunca `bootstrap@5` nem `@latest`: versão
   flutuante quebra o SRI no dia do release e o documento morre sem aviso.
5. **CSS próprio é exceção, e cabe numa tela.** Antes de escrever qualquer regra, procure o
   utilitário do Bootstrap (`d-flex`, `gap-3`, `text-body-secondary`, `border-top`, `py-4`). O
   `<style>` do template já tem o que é genuinamente impossível por utilitário — âncora sob navbar
   fixa, posição do botão de copiar, e impressão.
6. **Cor vem de variável do tema**, não de hex: `text-body-secondary`, `bg-body-tertiary`,
   `var(--bs-border-color)`. Hex cravado é o jeito mais rápido de produzir um documento que parece
   dois documentos.
7. **Todo bloco de código declara a linguagem**: `<pre><code class="language-ts">`. Sem a classe, o
   highlight.js chuta — e chuta diferente em cada bloco.
8. **Dentro de `<pre><code>`, escape `&` `<` `>`.** Sem exceção. Use o helper:
   ```bash
   node ~/.claude/skills/html-explainer-agent-skill/scripts/escape-code.mjs arquivo.ts --lang ts
   ```
9. **Todo `id` é único e todo par aba↔painel bate**: `button#tab-x[data-bs-target="#pane-x"][aria-controls="pane-x"]`
   ↔ `div#pane-x[aria-labelledby="tab-x"]`. Um `id` repetido faz a aba errada abrir.
10. **Não reimplemente comportamento que o Bootstrap já dá.** Navegação por seta/Home/End no
    tablist, `show/hide` de aba, colapso do accordion, foco do modal — tudo já vem no
    `bootstrap.bundle.min.js`.

## O que o runtime do template já resolve

Não reescreva isto; é o `<script>` no fim do arquivo.

- **Código-fonte cru capturado antes do highlight** — o botão copia o código, não os `<span>` do
  destaque nem os números de linha.
- **Botão de copiar em todo `<pre><code>`**, com `navigator.clipboard` quando há contexto seguro e
  fallback `document.execCommand('copy')` quando não há. **O fallback não é opcional**: em `file://`
  e em `http://` puro o `navigator.clipboard` pode simplesmente não existir, e chamar
  `.writeText()` nele estoura `TypeError` — não é uma promise rejeitada que dá para capturar com
  `.catch()`.
- **Aba ↔ URL nos dois sentidos**: abrir `arquivo.html#pane-armadilhas` já abre naquela aba; trocar
  de aba atualiza o hash via `history.replaceState` (usar `location.hash` faria a página pular).
  Hash apontando para um `<h2>` dentro de um painel abre o painel e rola até o título.
- **Impressão/PDF com todas as abas abertas** — `@media print` desdobra os painéis e imprime o
  rótulo de cada um. Sem isso, o PDF sai com uma aba só.

## Fora do básico

Leia o arquivo de referência **quando o caso aparecer** — não precisa carregar tudo sempre.

| Preciso de… | Leia |
|---|---|
| URL/versão/SRI exatos, jsDelivr × cdnjs × unpkg, adicionar linguagem ao highlight | `references/cdn.md` |
| Abas aninhadas, `nav-pills` vertical, abas com badge, sincronizar N grupos de aba (trocar "Python" em todos os blocos de uma vez) | `references/tabs.md` |
| Prism em vez de highlight.js, números de linha, destacar linha específica, diff, terminal falso, código longo com rolagem | `references/code-blocks.md` |
| Qual componente Bootstrap usar para cada coisa (alert, accordion, card, table, offcanvas, badge, TOC/scrollspy) | `references/components.md` |
| Deu errado / vai dar errado | `references/pitfalls.md` |
| Como escrever o texto: ordem, densidade, títulos, o que cortar | `references/writing.md` |

## Antes de entregar — checklist

- [ ] `check-doc.mjs` passou sem erro.
- [ ] Abri o arquivo no navegador e cliquei em **todas** as abas.
- [ ] Cliquei em um botão de copiar e colei em algum lugar.
- [ ] A primeira aba, sozinha, já responde a pergunta do título.
- [ ] Nenhuma linha de CSS que um utilitário do Bootstrap resolveria.
- [ ] Nenhum `TODO`, `«placeholder»` ou aba de exemplo do template sobrando.
- [ ] O arquivo abre por `file://` — testei com duplo clique, não por servidor local.
