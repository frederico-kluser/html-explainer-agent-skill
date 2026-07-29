# Blocos de código — destaque, cópia, escape

## Qual biblioteca

| | Escolha quando |
|---|---|
| **highlight.js** ✅ padrão | É o default desta skill. Uma tag `<script>`, uma de tema, `hljs.highlightAll()` e acabou. Traz ~38 linguagens no build de CDN e detecta sozinho se você não declarar (não deixe detectar — ver abaixo). |
| **Prism** | Você quer **números de linha**, **destacar linhas específicas** ou **realce de diff** com plugin pronto, sem escrever nada. O preço: cada plugin é mais uma tag `<script>` + `<link>`, e a ordem entre elas importa. |
| **Shiki** | Você quer exatamente as cores do VS Code e um tema TextMate real. Em arquivo único **não compensa**: é ESM, puxa gramáticas por rede em tempo de execução, e o SRI não cobre o que ele busca depois. Use se o realce fiel for o ponto do documento; caso contrário, não. |

Não misture dois no mesmo arquivo: ambos varrem `pre code` e o segundo destaca o HTML que o primeiro
gerou.

## As duas regras que não têm exceção

**1. Declare a linguagem.** Sempre `class="language-xxx"`.

```html
<pre><code class="language-typescript">const x: number = 1;</code></pre>
```

A auto-detecção do highlight.js decide por estatística sobre o texto do bloco. Em trechos de três
linhas ela erra com frequência — e erra *diferente* em cada bloco, então o mesmo snippet sai roxo
numa aba e verde na outra. Saída de terminal, que não é linguagem nenhuma, use `class="nohighlight"`.

**2. Escape `&`, `<` e `>` dentro de `<pre><code>`.** Nessa ordem — `&` primeiro, senão você
transforma `&lt;` em `&amp;lt;`.

| Você escreve | Vira |
|---|---|
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |

Um `<` não escapado faz o navegador abrir uma tag ali: o resto do bloco some da tela, o layout quebra
em silêncio, e o highlight.js grita no console *"One of your code blocks includes unescaped HTML"*.
**Esse aviso no console é o sintoma — trate como erro.**

Use o helper em vez de escapar à mão:

```bash
node ~/.claude/skills/html-explainer/scripts/escape-code.mjs arquivo.tsx
node ~/.claude/skills/html-explainer/scripts/escape-code.mjs arquivo.tsx --lines 40-58
cat trecho | node ~/.claude/skills/html-explainer/scripts/escape-code.mjs --lang json
```

E o `check-doc.mjs` reprova o arquivo se sobrar `<` cru.

**Escape hatch** para um bloco cheio de markup: guarde o código num `<script type="text/plain">` —
o navegador não executa nem interpreta o conteúdo — e mova para o `<pre>` no carregamento.

```html
<pre><code class="language-html" data-from="src-1"></code></pre>
<script type="text/plain" id="src-1">
<div class="card"><span>nada aqui precisa de escape</span></div>
</script>
```

```js
document.querySelectorAll('code[data-from]').forEach((c) => {
  c.textContent = document.getElementById(c.dataset.from).textContent.trim();
});
// rode ANTES de hljs.highlightAll()
```

A única sequência que ainda quebra é `</script` literal dentro do conteúdo — escreva `<\/script`.
Sem JS, o bloco aparece vazio: por isso o padrão continua sendo escapar.

## Espaço em branco: onde a formatação vaza

Dentro de `<pre>` **todo** caractere conta. Isto sai com uma linha em branco no topo e indentação
falsa em cada linha:

```html
<pre>
  <code class="language-js">
    const x = 1;
  </code>
</pre>
```

O certo é colar tudo, sem indentar pelo HTML — feio no fonte, correto na tela:

```html
<pre><code class="language-js">const x = 1;</code></pre>
```

Para blocos de várias linhas, comece o conteúdo logo depois do `>` e termine logo antes do `</code>`.
(HTML descarta *uma* quebra de linha imediatamente após `<pre>`, mas não depois de `<code>` — não
conte com isso.)

## Botão de copiar

Está no runtime do `template.html`. O que cada pedaço evita:

```js
if (navigator.clipboard && window.isSecureContext) { … }
```

**Testar `navigator.clipboard` antes de usar é obrigatório.** Fora de contexto seguro o objeto é
`undefined`, e `navigator.clipboard.writeText(t)` estoura `TypeError` — exceção síncrona, que
`.catch()` de promise não pega. Onde isso acontece de verdade: `http://` num IP de rede local
(`http://192.168.0.10/doc.html`). Em `file://` o Chromium **é** contexto seguro e a API existe
(verificado); ainda assim a escrita pode ser recusada em runtime — daí o segundo nível:

```js
navigator.clipboard.writeText(text).then(ok, () => legacyCopy(text));
```

A promise rejeita quando o documento não está em foco (`DOMException: Document is not focused`) ou
a permissão é negada. O `legacyCopy` com `document.execCommand('copy')` é obsoleto, mas continua
implementado em todos os navegadores e é o único caminho que funciona nos dois casos.

```js
ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
ta.select();
ta.setSelectionRange(0, ta.value.length);  // iOS ignora select() sozinho
```

`position: fixed` (não `absolute`) impede que a página role até o textarea invisível.
`execCommand` só funciona **dentro do handler de um gesto do usuário** — chamar de um `setTimeout`
não copia nada.

E o mais silencioso de todos: **capture o texto antes de destacar.**

```js
const sources = new WeakMap();
document.querySelectorAll('pre > code').forEach((c) => sources.set(c, c.textContent.replace(/\n$/, '')));
hljs.highlightAll();   // só depois
```

Depois do highlight, `textContent` ainda devolve o texto certo — mas com plugin de número de linha
o DOM ganha os números e a pessoa cola `1  const x = 1;`. Capturar antes é a única versão que nunca
mente.

### Plugins prontos

`highlightjs-copy` faz isso pelo highlight.js, com i18n e aviso a leitor de tela:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlightjs-copy@1.0.6/dist/highlightjs-copy.min.css"
      integrity="sha384-jx4j2QNE8PcYHQikjfTfY6TM0sYVodTr0OGqUfAR6bKYJBgW91lTieqkghTu9+Kk" crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/npm/highlightjs-copy@1.0.6/dist/highlightjs-copy.min.js"
        integrity="sha384-0/jh9+ifwJ5mqtDZ+DWdwgFjZ8I4HIfXqaWJi2mdeAwy8aUPlw5dTYNsqAqNE4yD" crossorigin="anonymous"></script>
<script>hljs.addPlugin(new CopyButtonPlugin({ lang: 'pt-BR' })); hljs.highlightAll();</script>
```

No Prism, o botão exige **toolbar + copy-to-clipboard, nessa ordem** — o plugin de cópia se registra
na toolbar e não faz nada se ela ainda não existir.

Nos dois casos o botão sai com o CSS deles, não com o do Bootstrap. Se importa que o botão pareça
parte do documento, fique com o do template.

## Receitas

**Nome do arquivo em cima do bloco** — dá contexto sem uma frase inteira:

```html
<div class="d-flex justify-content-between align-items-center bg-body-tertiary border border-bottom-0
            rounded-top px-3 py-1 small text-body-secondary font-monospace">
  <span>src/server/auth.ts</span><span>TypeScript</span>
</div>
<pre class="mt-0"><code class="language-typescript">…</code></pre>
```

**Bloco longo com rolagem** — em vez de 200 linhas empurrando a aba:

```html
<pre style="max-height: 26rem; overflow: auto"><code class="language-python">…</code></pre>
```

**Diff** — o highlight.js entende `language-diff` e colore `+`/`-` sozinho:

```html
<pre><code class="language-diff">- const a = 1;
+ const a = 2;</code></pre>
```

**Terminal** — comando e saída juntos, sem inventar cor de linguagem:

```html
<pre><code class="nohighlight"><span class="text-success">$</span> npm run build
built in 1.2s</code></pre>
```

(É o único caso em que HTML dentro de `<code>` é intencional. `nohighlight` impede o highlight.js de
reescrever o bloco e apagar o `<span>`.)

**Destacar uma linha sem plugin** — `<mark>` funciona e o highlight.js não a remove se você marcar
depois; mais simples é um comentário `// ← aqui` na própria linha. Precisando muito disso, é o caso
de trocar para Prism com `line-highlight`.

**Código inserido depois do load** (você gerou HTML por JS): `hljs.highlightAll()` só varre o que
existia. Para um bloco novo:

```js
hljs.highlightElement(novoCode);
```

Chamar `highlightElement` duas vezes no mesmo elemento dá aviso de "já destacado" e produz `<span>`
dentro de `<span>` — o `data-highlighted="yes"` que ele grava serve justamente para você checar antes.
