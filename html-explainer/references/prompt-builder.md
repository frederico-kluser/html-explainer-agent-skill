# Construtor de prompt — aba que monta um prompt XML ao vivo

> **Feature opcional.** Só existe no documento quando alguém pede. Um documento normal do
> html-explainer não tem construtor.

O construtor é **uma aba a mais** no documento: à esquerda, perguntas de múltipla escolha
(`radio`) e de marcar-vários (`checkbox`); à direita, o prompt XML remontado a cada clique, com
botão de copiar. O prompt inteiro — perguntas, fragmentos e esqueleto — é **declarado em XML**
num bloco inerte dentro do próprio arquivo. Nada de build, nada de dependência nova: o runtime
são ~120 linhas de JS que já viajam dentro do documento.

---

## CONTRATO NORMATIVO v1

> Esta seção é **congelada**. `assets/prompt-builder.html`, `scripts/new-builder.mjs` e
> `scripts/check-doc.mjs` implementam exatamente o que está aqui. Mudar um nome de atributo
> quebra os três ao mesmo tempo.

### 1. A especificação XML

Vive num bloco inerte, no corpo do documento, entre marcadores:

```html
<!-- pb:spec:begin -->
<script type="application/xml" id="pb-spec-plano">
<prompt-builder id="plano" lang="xml" title="Construtor do prompt de plano">
  ...
</prompt-builder>
</script>
<!-- pb:spec:end -->
```

`type="application/xml"` é o ponto: o navegador **não executa** o bloco e **não parseia** o
conteúdo como HTML — ele fica como texto cru até o `</script>`. O runtime o lê com `DOMParser`.

#### Elemento raiz `<prompt-builder>`

| atributo | obrig. | valor |
|---|---|---|
| `id` | sim | `[a-z][a-z0-9-]*` — prefixo de todo `id` gerado e chave do `localStorage` |
| `lang` | não | linguagem do bloco de saída para o highlight. Padrão `xml` |
| `title` | não | título exibido acima do formulário |

#### `<question>` (1..n)

| atributo | obrig. | valor |
|---|---|---|
| `id` | sim | `[a-z][a-z0-9-]*`, único dentro do construtor. É o nome usado em `{{id}}` |
| `type` | sim | `radio` · `checkbox` · `text` · `textarea` |
| `label` | sim | vira a `<legend>` do `<fieldset>` |
| `help` | não | uma linha de ajuda sob o rótulo |
| `join` | não | só para `checkbox`: `newline` (padrão) · `blank-line` · `comma` · `space` |
| `placeholder` | não | só para `text`/`textarea` |
| `default` | não | só para `text`/`textarea`: valor inicial |

#### `<option>` (1..n, obrigatório em `radio` e `checkbox`; proibido em `text`/`textarea`)

| atributo | obrig. | valor |
|---|---|---|
| `value` | sim | único dentro da pergunta |
| `label` | sim | o rótulo clicável |
| `default` | não | `default="true"`. Em `radio`: **exatamente uma** opção. Em `checkbox`: zero ou mais |

O **corpo** do `<option>` é o fragmento inserido quando ela está selecionada — sempre em
`<![CDATA[ ... ]]>`, porque o fragmento é XML e não pode ser reinterpretado. Corpo vazio →
o fragmento é o próprio `value`.

#### `<template>` (exatamente 1)

`<![CDATA[ ... ]]>` com o esqueleto do prompt e os marcadores `{{id-da-pergunta}}`.

### 2. Substituição

- `{{id}}` — `radio`: o fragmento da opção escolhida. `checkbox`: os fragmentos das marcadas,
  unidos pelo `join`. `text`/`textarea`: o valor digitado, sem escape adicional.
- **Indentação preservada:** se o marcador está sozinho na linha, a indentação dele é aplicada a
  **todas** as linhas do fragmento inserido. Fragmento multi-linha colado sem isso sai torto e o
  XML fica ilegível.
- **Linha vazia some:** marcador sozinho na linha cujo resultado é vazio → a linha inteira é
  removida, sem deixar buraco.
- `{{id}}` que não casa com nenhuma pergunta: fica literal no texto e o linter **reprova**.
- Não existe condicional, laço, nem aninhamento. Fragmento é a única forma de condicionar.

### 3. Contrato do DOM

O autor escreve a casca dentro do `.tab-pane`; o runtime preenche `[data-pb-form]`.

```
<!-- pb:shell:begin -->
<div class="prompt-builder" id="pb-plano" data-pb-spec="pb-spec-plano">
  <div data-pb-form> <noscript>…aviso…</noscript> </div>
  <button data-pb-copy>  <button data-pb-reset>  <span data-pb-status aria-live="polite">
  <pre data-live><code class="language-xml" data-pb-output>…prompt padrão, escapado…</code></pre>
</div>
<!-- pb:shell:end -->
```

| seletor | papel |
|---|---|
| `.prompt-builder[data-pb-spec="<id do script da spec>"]` | raiz; `id` obrigatório |
| `[data-pb-form]` | onde o runtime injeta os `<fieldset>`. Deve conter um `<noscript>` |
| `[data-pb-output]` | o `<code>` da saída, **dentro** de um `<pre data-live>` |
| `[data-pb-copy]` | botão "Copiar prompt" |
| `[data-pb-reset]` | botão "Restaurar padrões" |
| `[data-pb-status][aria-live="polite"]` | linha curta de status ("prompt atualizado · 42 linhas") |

**Ids gerados** (nunca escritos à mão): `fieldset` = `<pb-id>-<question-id>`;
controle = `<pb-id>-<question-id>-<option-value>`. Cada `<input>` tem `<label for>` casado.
`radio` compartilha `name="<pb-id>-<question-id>"`.

**Persistência:** `localStorage['pb:' + <pb-id>]`, JSON, **sempre** em `try/catch` — em
navegação privativa e em alguns `file://` o acesso estoura `SecurityError` e derruba o handler.

### 4. Ganchos no runtime do template

Duas linhas — e só estas duas — mudam no `<script>` "congelado" de `assets/template.html`:

1. **`data-live`** — o laço que guarda a fonte crua **pula** blocos vivos:
   ```js
   document.querySelectorAll('pre > code').forEach(function (code) {
     if (code.closest('[data-live]')) return;   // texto muda em runtime: leia na hora do clique
     sources.set(code, code.textContent.replace(/\n$/, ''));
   });
   ```
   Sem isso o botãozinho de hover copia o prompt **inicial** para sempre — o cache foi tirado no
   `load` e nunca mais é atualizado.
2. **`window.__explainerCopy = copyText;`** ao final da IIFE — o botão grande do construtor reusa
   a mesma lógica (`navigator.clipboard` + fallback `execCommand`) em vez de duplicá-la. O
   construtor deve funcionar mesmo se o gancho não existir.

### 5. Re-highlight obrigatório

A cada remontagem, nesta ordem:

```js
code.textContent = prompt;              // textContent, NUNCA innerHTML
delete code.dataset.highlighted;        // hljs 11.9+ recusa re-destacar sem isto
if (window.hljs) hljs.highlightElement(code);
```

### 6. O que o linter (`check-doc.mjs`) reprova

**Erro:**
- `[data-pb-output]` fora de um `<pre data-live>`; casca sem `[data-pb-form]`, `[data-pb-output]` ou `[data-pb-copy]`
- spec sem casca que a referencie, ou casca cujo `data-pb-spec` não aponta para nenhuma spec
- `id` de `<question>` duplicado ou fora de `[a-z][a-z0-9-]*`; `type` fora dos quatro
- `radio` sem exatamente um `default`; `radio`/`checkbox` sem `<option>`; `option` sem `value`/`label`
- `<template>` ausente ou repetido; `{{x}}` sem pergunta `x`

**Aviso:**
- pergunta declarada e nunca usada no `<template>`
- casca sem `[data-pb-status][aria-live]`, sem `[data-pb-reset]` ou sem `<noscript>`
- mais de 12 perguntas num construtor

> **Armadilha do próprio linter:** `mask()` apaga o miolo de todo `<script>`. A spec **precisa** ser
> extraída do HTML **cru**, antes de mascarar — senão o linter enxerga um bloco vazio.

---

<!-- «a preencher na Onda 2»: como escolher as perguntas, exemplo completo comentado,
     armadilhas de runtime, checklist de entrega. -->
