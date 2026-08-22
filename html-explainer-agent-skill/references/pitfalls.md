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
`shown.bs.tab`" de tutorial — é ruído puro. (Da versão 11.9.0 em diante, a segunda chamada
simplesmente sai fora graças ao `data-highlighted`; o estrago é só o aviso no console.)

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

```js
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

## Bloco que muda em runtime: o cache da fonte crua congela o texto

O runtime do template guarda, no `load`, o `textContent` de **todo** `pre > code` num `WeakMap` —
é assim que o botãozinho de hover copia o código e não os `<span>` do destaque. Num bloco cujo
conteúdo muda depois (o construtor de prompt é o caso), esse cache é tirado uma vez e nunca mais
atualizado: a tela mostra o prompt novo, a área de transferência entrega o inicial. Para sempre.

O sintoma é cruel porque nada quebra — a pessoa cola o prompt errado no agente e culpa o agente.

```js
document.querySelectorAll('pre > code').forEach(function (code) {
  if (code.closest('[data-live]')) return;   // texto muda em runtime: leia na hora do clique
  sources.set(code, code.textContent.replace(/\n$/, ''));
});
```

`<pre data-live>` marca o bloco vivo, e o `check-doc.mjs` reprova `[data-pb-output]` que não esteja
dentro de um.

## `hljs` recusa re-destacar — e destacar cedo demais avisa duas vezes

Da 11.9.0 em diante, `highlightElement()` começa com um `if (el.dataset.highlighted) return` seguido
de `console.log("Element previously highlighted. To highlight again, first unset
dataset.highlighted.")` — conferido no fonte da 11.11.1, que também grava
`dataset.highlighted = "yes"` no fim. Então, ao trocar o conteúdo de um bloco já destacado, a ordem
é sempre esta:

```js
code.textContent = novo;            // textContent, nunca innerHTML
delete code.dataset.highlighted;    // sem isto a chamada seguinte só loga e volta
if (window.hljs) hljs.highlightElement(code);
```

O irmão dessa armadilha aparece na **carga**. `hljs.highlightAll()` com
`document.readyState === "loading"` não roda na hora: registra
`window.addEventListener("DOMContentLoaded", …)` e roda depois. Quem destaca um bloco no meio do
caminho ganha o aviso no console de **toda** carga do documento, porque o `highlightAll` pendente
reencontra o bloco já marcado. A condição certa não é "já foi destacado?" — nesse instante o
atributo ainda não existe — e sim "há um `highlightAll` a caminho?": com `readyState === 'loading'`,
escreva o texto e deixe o destaque com ele.

## `DOMParser` não lança exceção em XML inválido

Nenhum `throw`, nenhum `catch` que sirva de rede: `parseFromString(xml, 'application/xml')` devolve
um documento **de erro**, com um elemento `<parsererror>` dentro. Quem só põe `try/catch` em volta
morre calado — a aba abre vazia, o console limpo, e não há por onde começar a procurar.

```js
var doc = new DOMParser().parseFromString(xml, 'application/xml');
var bad = doc.querySelector('parsererror');
if (bad) return { error: bad.textContent.trim().split('\n')[0] };
```

E mostre esse erro na tela, não no console: quem abre o arquivo não tem DevTools aberto.

## `</script>` dentro de `<script type="application/xml">` termina o bloco

O parser de HTML não interpreta o conteúdo desse `<script>` — mas procura o fechamento. A primeira
sequência `</script>` encerra o bloco, **inclusive dentro de `<![CDATA[ … ]]>`**, porque CDATA é
conceito de XML e o parser de HTML não sabe o que é. O resto do XML vaza para o corpo da página, o
layout se desfaz e o erro não menciona script nenhum.

Consequência prática: a spec de um construtor não pode conter essa sequência. Se o prompt precisa
falar de `</script>`, quebre em `<` + `/script>` no fragmento, ou reescreva a frase.

## `aria-live` no bloco de código é pior que não ter

Marcar o `<pre>` do prompt com `aria-live="polite"` parece a coisa acessível a fazer. Na prática o
leitor de tela relê **as 38 linhas** a cada clique numa opção, e a pessoa desiste do documento antes
da terceira pergunta.

O anúncio vai numa frase curta, num elemento à parte: `prompt atualizado · 38 linhas`. O bloco de
código fica mudo — quem quiser lê no próprio ritmo.

## `localStorage` estoura `SecurityError` — no acesso, não só na escrita

Navegação privativa e parte dos `file://` bloqueiam o objeto inteiro. Sem `try/catch`, a exceção
sobe e derruba **o resto do handler** — o clique que salvava a resposta para de atualizar o prompt
também, e o documento fica inerte sem dizer por quê. Vale para ler e para gravar:

```js
function load(key) {
  try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }                 // sem persistência, mas o documento segue vivo
}
```

Persistir é enfeite; funcionar não é. (`references/tabs.md` documenta a mesma causa para abas
sincronizadas.)

## `innerHTML` come as tags do prompt

O prompt montado **é** XML. Jogado com `innerHTML`, o navegador interpreta: `<level name="padrao">`
vira um elemento desconhecido, o texto some da tela e o que sobra é um prompt sem as tags que davam
sentido a ele. `textContent` faz o que se espera, e é mais rápido.

## Parsing de atributo por `[^>]*` mente

Regex de tag no formato `<div[^>]*>` parece inofensiva e não é. Duas verdades a derrubam: `>` sem
escape é **legal** dentro de um valor de atributo (XML e HTML), e aspas **simples** são legais em
HTML. Isso custou quatro defeitos bloqueantes no `check-doc.mjs`, todos achados por revisão
adversarial, nenhum por teste:

- casca escrita com `class='prompt-builder'` ficava invisível para o linter — e com ela iam embora,
  em silêncio, todas as checagens que dependem de achar a casca;
- a palavra "default" dentro de um `label` contava como o atributo `default`, e a pergunta passava
  a ter duas opções padrão aos olhos de quem checava;
- `class="prompt-builder-legend"`, um auxiliar decorativo, virava uma casca fantasma — porque `\b`
  trata `-` como fronteira de palavra, e a classe era casada como substring em vez de token da
  lista;
- um `>` legítimo dentro de um valor de atributo fechava a tag cedo, e o resto dos atributos
  desaparecia da análise.

A correção é sempre a mesma: parseie os atributos respeitando aspas duplas, aspas simples e valor
pelado, e compare classe como **token** de `class.split(/\s+/)`, nunca como substring.

## Coisas que parecem problema e não são

- **`file://` é contexto seguro no Chromium** — `window.isSecureContext === true` e
  `navigator.clipboard` existe (verificado). O fallback do botão de copiar continua necessário por
  causa de `http://` em IP de rede e de recusa em runtime, não por causa do `file://`.
- **Abas não ativas com `tabindex="-1"`** é o padrão ARIA, não bug: **Tab** deve pular da aba ativa
  direto para o conteúdo, e as setas andam entre as abas.
- **Navegação por teclado nas abas já vem pronta** desde o Bootstrap 5.2. Não implemente `keydown`.
