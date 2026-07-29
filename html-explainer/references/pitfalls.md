# Armadilhas

Cada item aqui já quebrou um documento de verdade. Os números foram medidos em Chromium/Brave sobre
`file://`, não copiados de blog.

## Aba escondida é `display: none` — e nada consegue se medir lá dentro

**A mais cara da lista.** Bootstrap esconde o painel inativo com `display: none`. Dentro dele,
`getBoundingClientRect()` e `getBBox()` devolvem zero. Qualquer biblioteca que **meça** para desenhar
— Mermaid, Chart.js, D3, tabela com coluna elástica, mapa — produz um resultado degenerado, e o
estrago só aparece quando a pessoa clica na aba.

Medido com Mermaid 11.16 e dois diagramas idênticos:

| painel | `viewBox` do SVG |
|---|---|
| visível | `0 0 340.45 70` ✅ |
| escondido | `-8 -8 16 16` ❌ |

O diagrama **existe** — tem os nós, tem os textos — mas dentro de uma caixa de 16×16. Abrir a aba
não conserta: o SVG já nasceu errado.

A correção é **renderizar quando a aba aparece**, uma vez só:

```js
mermaid.initialize({ startOnLoad: false, theme: 'dark' });
mermaid.run({ nodes: document.querySelectorAll('.tab-pane.active .mermaid') });

document.querySelectorAll('[data-bs-toggle="tab"]').forEach((t) => {
  t.addEventListener('shown.bs.tab', (e) => {
    const pane = document.querySelector(e.target.getAttribute('data-bs-target'));
    const todo = pane.querySelectorAll('.mermaid:not([data-processed])');
    if (todo.length) mermaid.run({ nodes: todo });   // :not([data-processed]) = não repete
  });
});
```

Com essa correção, o mesmo painel escondido passa a `viewBox="0 0 332.75 70"` (medido). Para
Chart.js o equivalente é `chart.resize()` no `shown.bs.tab`; para tabela elástica, recalcular ali.

**O highlight.js NÃO precisa disso.** Ele reescreve texto, não mede layout: verificado, um bloco em
aba escondida sai com `data-highlighted="yes"` e as cores certas. Não copie "re-highlight no
`shown.bs.tab`" de tutorial — é ruído, e chamar `highlightElement` duas vezes gera `<span>` aninhado.

### E o irmão dela: registrar o listener tarde demais

Abrir o arquivo em `documento.html#pane-x` dispara `shown.bs.tab` **no carregamento**. Se o listener
que renderiza o diagrama daquela aba for registrado *depois* da chamada que ativa a aba pelo hash, o
evento já passou — e o diagrama nunca aparece. Só naquela aba, só quando se chega por link: o tipo
de falha que ninguém reproduz.

A ordem correta no fim do runtime é sempre a mesma: **registre todos os listeners, renderize a aba
inicial à mão (ela não dispara `shown.bs.tab`), e só então chame `activateFromHash()`.**

## `integrity` sem `crossorigin` bloqueia o recurso

Não é aviso, é bloqueio. A verificação de SRI precisa de resposta CORS legível; sem
`crossorigin="anonymous"` a resposta é opaca, o navegador não consegue conferir e descarta. O
sintoma é a página **sem estilo nenhum** e um erro de CORS no console que não menciona `integrity`.

Vale o inverso: `crossorigin` sem `integrity` é inofensivo.

## Versão flutuante + SRI = bomba-relógio

`bootstrap@5` ou `@latest` resolvem para o patch mais novo. No dia do release o hash não bate e o
documento — que funcionava havia meses — abre em branco. Trave `5.3.8`.

## `<` cru dentro de `<pre><code>`

O navegador abre uma tag ali. O resto do bloco some, o layout se desfaz e o highlight.js escreve no
console *"One of your code blocks includes unescaped HTML"*. Escape `&` `<` `>` — nessa ordem, `&`
primeiro. `scripts/escape-code.mjs` faz; `check-doc.mjs` reprova quem esqueceu.

## `fade` sem `show` no painel inicial

`class="tab-pane fade active"` sem `show` renderiza com `opacity: 0`. A aba abre **vazia** e parece
conteúdo faltando. O correto é `tab-pane fade show active` — e só nesse painel.

## `location.hash = '#x'` faz a página pular

Atribuir o hash manda o navegador rolar até o elemento. A cada troca de aba a página dá um salto.
Use `history.replaceState(null, '', '#' + id)`.

## Impressão sai com uma aba só

Óbvio depois: o que está em `display: none` não vai para o papel nem para o PDF. Sem o bloco
`@media print` do template, exportar um documento de 5 abas produz um PDF de 1 aba — e ninguém
percebe até o cliente reclamar.

## `bootstrap.min.js` no lugar do bundle

`bootstrap.min.js` **não** traz o Popper. Abas e accordion funcionam; dropdown, tooltip e popover
falham. Use sempre `bootstrap.bundle.min.js`.

## Tooltip e popover não iniciam sozinhos

Ao contrário de aba, modal e accordion, tooltip e popover são **opt-in** — por custo de desempenho.
Só o `data-bs-toggle="tooltip"` não faz nada. Precisa de:

```js
document.querySelectorAll('[data-bs-toggle="tooltip"]')
        .forEach((el) => new bootstrap.Tooltip(el));
```

## `shown.bs.tab` de aba aninhada borbulha

O listener do grupo de fora recebe os eventos do grupo de dentro. Filtre:

```js
if (e.target.closest('.tab-content')) return;   // veio de dentro
```

## `id` duplicado

`document.querySelector('#x')` devolve o primeiro. A aba abre o painel errado, a âncora vai para o
lugar errado, e nada dá erro. Prefixe ids em abas aninhadas (`#pane-api-python`). O `check-doc.mjs`
pega.

## ESM por CDN: o SRI cobre só a porta de entrada

`mermaid.esm.min.mjs` tem 29 KB — é um shim. Dentro dele:

```
from"./chunks/mermaid.esm.min/chunk-Y3FQM624.mjs"
from"./chunks/mermaid.esm.min/chunk-7FYTHRHK.mjs"
…
```

O `integrity` do arquivo de entrada **não** cobre esses pedaços; eles chegam sem verificação. Em
documento de arquivo único, prefira o build **UMD** (`mermaid.min.js`), que é um arquivo só e o SRI
cobre inteiro.

## O documento depende da rede

CDN fora do ar, máquina offline, rede corporativa bloqueando `cdn.jsdelivr.net` — e o arquivo abre
como texto sem estilo. É o preço de não ter build, e vale a pena na maioria das vezes.

Quando **não** valer (leitor sem internet, ambiente fechado), a saída é embutir tudo: baixe os
`.min.css` e `.min.js` e cole dentro de `<style>` e `<script>`. Fica um arquivo de ~500 KB, feio de
editar, mas 100% offline — e aí **remova** os `integrity`, que só fazem sentido em recurso externo.

## Coisas que parecem problema e não são

- **`file://` é contexto seguro no Chromium** — `window.isSecureContext === true` e
  `navigator.clipboard` existe (verificado). O fallback do botão de copiar continua necessário por
  causa de `http://` em IP de rede e de recusa em runtime, não por causa do `file://`.
- **Abas não ativas com `tabindex="-1"`** é o padrão ARIA, não bug: **Tab** deve pular da aba ativa
  direto para o conteúdo, e as setas andam entre as abas.
- **Navegação por teclado nas abas já vem pronta** desde o Bootstrap 5.2. Não implemente `keydown`.
