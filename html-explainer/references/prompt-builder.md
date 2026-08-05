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

```html
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

## v1.1 — adendos

A v1 foi escrita antes da implementação. Escrever `assets/prompt-builder.html` descobriu cinco
coisas que ela não previa. **Nada aqui contradiz a v1** — tudo acrescenta, e tudo já está no fonte
da implementação de referência.

### 1. O quarto ponto de injeção não tem marcador: o CSS

`pb:spec`, `pb:shell` e `pb:runtime` não cobrem o arquivo inteiro. Três pedaços ficam de fora dos
marcadores e precisam ir junto na mão:

```css
/* dentro do @media print do <style> do <head> */
.prompt-builder pre { max-height: none !important; overflow: visible !important; }
.prompt-builder .position-sticky { position: static !important; }
```

```html
<!-- no <pre> da casca, para o prompt longo não empurrar a página inteira -->
<pre data-live style="max-height: 30rem; overflow: auto">
```

Os três andam juntos: a rolagem existe **por causa** do `max-height`, e no papel não existe
rolagem. Quem copia só os três blocos marcados entrega um PDF com o prompt cortado em 30 rem — o
oposto da "impressão com todas as abas abertas" que a skill vende. O `position-sticky` tem o mesmo
problema: sticky no papel gruda a coluna no lugar errado.

### 2. O bloco pré-preenchido é **recomputado**, nunca copiado

O `<code data-pb-output>` nasce com o prompt padrão já dentro, escapado. Ele existe para que quem
abre sem JavaScript, quem imprime e quem lê o *view-source* recebam **o mesmo** prompt que o
construtor entrega — e não uma aproximação.

Na implementação de referência ele é byte-a-byte idêntico ao `build(model, defaults(model))`
(38 linhas, conferido com `diff`). Isso não é decoração: se o texto pré-preenchido não bate com o
que o JavaScript monta, o documento **mente** para metade dos leitores, e ninguém percebe porque as
duas versões nunca aparecem na mesma tela.

Logo: a cada spec nova, ou a cada mexida num fragmento, o bloco é **regerado** a partir da spec e
escapado (`&` `<` `>`, nessa ordem). Copiá-lo deste arquivo ou do exemplo é o erro.

### 3. Três detalhes de montagem que viraram normativos

A v1 não os fixou; a implementação escolheu — e agora eles são contrato de fato, porque um
construtor que escolha diferente produz **outro prompt a partir do mesmo formulário**.

| detalhe | a regra | por que importa |
|---|---|---|
| id do controle de `text`/`textarea` | `<pb-id>-<question-id>-input`, com `<label for>` casado e `visually-hidden` | a `<legend>` já rotula na tela; o `<label>` existe para o leitor de tela casar nome e campo sem repetir o texto |
| ordem do `checkbox` | a ordem da **spec**, nunca a ordem dos cliques | senão as mesmas respostas geram prompts diferentes conforme a sequência de cliques |
| `text`/`textarea` | `.trim()` antes de substituir | sem isso um espaço perdido faz o valor deixar de ser vazio, e a regra "linha vazia some" não dispara — o prompt sai com um buraco indentado |

Os separadores de `join`, também fixados pela implementação:

| `join` | separador |
|---|---|
| `newline` (padrão) | `\n` |
| `blank-line` | `\n\n` |
| `comma` | vírgula + espaço |
| `space` | espaço |

E um esclarecimento sobre a raiz: `lang` é **declarativo**. O runtime lê o atributo e não faz nada
com ele — quem manda no destaque é a classe `language-*` do `<code data-pb-output>`. Mantenha os
dois iguais; `lang="json"` com `class="language-xml"` destaca como XML e não avisa.

### 4. Seis checagens novas do linter — acrescentam ao §6

Todas **erro**, exceto onde dito:

1. **`<prompt-builder>` sem `id`, ou com `id` fora de `[a-z][a-z0-9-]*`.** Esse `id` prefixa todo
   `id` gerado (`<pb-id>-<pergunta>-<opção>`) e é a chave do `localStorage`. São duas falhas
   diferentes, e nenhuma delas quebra o `<label for>` — o runtime casa `for` com o `id` do
   controle qualquer que seja a string:
   - **sem `id`:** `pbModel` cai no prefixo genérico (`id: root.getAttribute('id') || 'pb'`), os
     ids viram `pb-<pergunta>-<opção>` e o estado vai para `localStorage["pb:pb"]`. Dois
     construtores assim no mesmo documento — ou um sem `id` e outro com `id="pb"` — nascem com
     ids duplicados e disputam a mesma memória.
   - **`id` inválido:** o que quebra é **endereçamento**. Com espaço, maiúscula ou acento, os ids
     gerados deixam de ser alcançáveis por âncora `#id` na URL e por seletor CSS.
2. **`<option>` dentro de `text`/`textarea`.** O runtime ignora, e o autor fica esperando um
   `radio` que nunca aparece.
3. **Spec cujo `<script>` não tem `type="application/xml"`.** É a mais grave da lista: o navegador
   **executa** o bloco, cospe um `SyntaxError` no console, a aba abre vazia — e o filtro de "script
   inerte" do próprio linter fazia a spec nem ser enxergada. Documento quebrado com exit 0.
   O discriminador: num `<script>` executável, só conta como spec quebrada o bloco que traz o
   elemento raiz **inteiro** — abertura **e** fechamento. É por isso que o runtime do construtor,
   que cita `<prompt-builder>` numa string de erro sem fechamento, continua invisível ao linter, e
   por isso `assets/prompt-builder.html` continua aprovado. Sem esse recorte, a implementação de
   referência reprovaria a si mesma.
4. **`join` com valor fora dos quatro.** Erro — o runtime troca o desconhecido por `newline` sem
   avisar. `join` **válido** numa pergunta que não é `checkbox`: aviso — inofensivo, mas denuncia
   um `type` errado. Os dois nunca saem juntos: valor inválido emite só o erro, e o aviso de
   "`join` fora de `checkbox`" só é avaliado quando o valor é válido.
5. **Ganchos do §4 da v1 ausentes num documento que tem construtor.** Sem o `data-live` no laço de cache
   e sem o `window.__explainerCopy`, o construtor abre e parece funcionar; só o botão de copiar
   mente.
6. **Duas cascas apontando para a mesma spec, ou dois `<prompt-builder>` no mesmo `<script>`.**
   - **Duas cascas:** as duas montam o mesmo construtor, com os mesmos ids gerados — dividem a
     chave do `localStorage` e sobrescrevem uma à outra. E antes disso: o runtime lê os controles
     por `getElementById`, que devolve **sempre o primeiro do documento**, então mexer na segunda
     casca não muda o prompt dela.
   - **Duas raízes:** dois elementos raiz é XML **mal formado**. O `DOMParser` recusa a spec
     **inteira**, `pbParse` devolve erro e `pbFail` pinta o alerta vermelho de spec inválida: a aba
     abre **sem nenhuma pergunta** — não com as do primeiro.

O linter também reprova `default` com qualquer valor que não seja `"true"` ou `"false"` — o runtime
compara com a **string** `'true'`, então `default` pelado ou `default="1"` abre a opção desmarcada,
em silêncio.

### 5. Na carga, quem destaca é o `highlightAll` — não o construtor

O runtime do construtor **não** chama `hljs.highlightElement()` na primeira montagem quando
`document.readyState === 'loading'`. Motivo: nesse instante o `hljs.highlightAll()` do runtime do
template já deixou um ouvinte de `DOMContentLoaded` agendado (verificado no fonte da 11.11.1: com
`readyState === "loading"` ele registra `window.addEventListener("DOMContentLoaded", …)`). Se o
construtor destacasse antes, o `highlightAll` reencontraria o bloco com `data-highlighted="yes"` e
escreveria *"Element previously highlighted. To highlight again, first unset
`dataset.highlighted`"* no console de **toda** carga do documento.

A condição certa não é "este bloco já foi destacado?" — na carga o atributo ainda não existe. É
**"há um `highlightAll` a caminho?"**:

```js
var hlPendente = doc.readyState === 'loading';
refresh(false, hlPendente);                    // com deferHl: escreve o texto, não destaca
if (hlPendente) global.addEventListener('DOMContentLoaded', function () {
  // rede de segurança: este ouvinte foi registrado depois do que o highlightAll registrou,
  // logo roda depois dele. Bloco ainda sem data-highlighted = não havia highlightAll nenhum.
  if (!out.dataset.highlighted && global.hljs) global.hljs.highlightElement(out);
});
```

Na **re**montagem — todo clique dali em diante — vale a receita normal do §5: `textContent` →
`delete dataset.highlighted` → `highlightElement`.

---

## Como escolher as perguntas

Esta é a única decisão de design do construtor, e ela é de **conteúdo**. O erro caro não é escolher
o tipo errado: é transformar em pergunta algo que nunca muda.

| Vira… | Quando | O sinal | Exemplo |
|---|---|---|---|
| **`radio`** | as opções se excluem e cada uma **troca o esqueleto** do pedido | trocar a resposta produz *outro* prompt, não um prompt maior | profundidade: `rascunho` × `padrão` × `exaustivo` |
| **`checkbox`** | as opções se **somam**; cada marcada acrescenta um pedaço independente | dá para marcar todas ao mesmo tempo sem contradição | seções obrigatórias do plano; restrições |
| **`text`** | o valor é **do usuário** e o autor não tem como enumerar | você escreveria "ex.:" antes de listar | o que precisa ser planejado |
| **`textarea`** | idem, mas a resposta tem mais de uma linha | você pediria "uma afirmação por linha" | contexto do repositório |
| **nada** | a resposta é sempre a mesma | você marcaria um default e ninguém jamais mudaria | o protocolo de trabalho, o formato de saída obrigatório |

As quatro conversões que aparecem toda vez:

- **`radio` cujas opções não se contradizem é `checkbox`.** Se a opção existe só para acrescentar
  uma frase ao prompt, ela é aditiva — e obrigar a escolher uma só é perda de informação.
- **`checkbox` com opções que brigam é `radio`.** Marcar "seja breve" e "seja exaustivo" junto
  produz um prompt que se contradiz, e o agente obedece ao último.
- **`radio` com uma opção usada em 90% dos casos vira texto fixo.** Corte a pergunta e ponha a
  opção vencedora direto no `<template>`. O formulário fica mais curto e ninguém perde nada.
- **Pergunta que não aparece no `<template>` não é pergunta.** O linter avisa; a correção é apagar,
  não inventar um lugar para ela.

Regras de bolso:

- **4 a 6 perguntas.** Abaixo de 3, entregue um bloco de código com dois lugares para trocar — o
  construtor não se paga. Acima de 12 o linter avisa, e com razão: ninguém chega ao fim.
- **A ordem é a ordem em que a pessoa pensa**: primeiro o alvo (o que ela já sabe), depois o
  contexto, depois as escolhas de forma. Pergunta de forma antes do alvo trava.
- **O `default` de cada pergunta é uma opinião sua**, e é o prompt que 80% vai usar sem tocar em
  nada. Escolha como se ninguém fosse clicar.
- **`text` e `textarea` entram sem escape.** Um `<` ou `&` digitado ali quebra o XML. Avise no
  documento e prefira campos que pedem prosa.

## Um exemplo completo, comentado

Quatro perguntas — uma de cada tipo — pedindo um plano a um agente. É a versão enxuta do que
`assets/prompt-builder.html` traz com seis; abra o arquivo para a versão inteira, funcionando.

```xml
<prompt-builder id="plano" lang="xml" title="Monte o prompt que pede o plano">

  <!-- text: só o usuário sabe. O default é um exemplo plausível, para o bloco
       pré-preenchido nunca sair vazio na impressão e no "sem JavaScript". -->
  <question id="alvo" type="text"
            label="O que precisa ser planejado"
            help="Uma linha, verbo no infinitivo e alvo concreto."
            placeholder="ex.: trocar o parser de configuração de YAML para TOML"
            default="Trocar o parser de configuração de YAML para TOML"/>

  <!-- textarea: mesma natureza do anterior, resposta multi-linha. O valor entra
       cru; peça prosa, não XML. -->
  <question id="contexto" type="textarea"
            label="Contexto que só você tem"
            help="Versões, restrições do time, o que já foi tentado e falhou."
            placeholder="uma afirmação por linha"
            default="Monorepo Node 20; a configuração é lida em onze lugares."/>

  <!-- radio: as três se excluem e cada uma troca o pedido inteiro. Exatamente uma
       default="true" — sem ela o runtime cai na primeira do XML, e o padrão do
       documento passa a ser a ordem em que você digitou. -->
  <question id="profundidade" type="radio"
            label="Profundidade do plano"
            help="Quanto o agente deve investigar antes de propor.">
    <option value="rascunho" label="Rascunho — as etapas e a ordem"><![CDATA[<level name="rascunho">Só as etapas e a ordem entre elas. Uma página, no máximo.</level>]]></option>
    <option value="padrao" label="Padrão — etapas, arquivos e riscos" default="true"><![CDATA[<level name="padrao">Etapas na ordem de execução, com os arquivos que cada uma toca e o risco que ela carrega.</level>
<budget max-lines="120">Detalhe o que muda uma decisão e resuma o resto.</budget>]]></option>
    <option value="exaustivo" label="Exaustivo — leia o código antes"><![CDATA[<level name="exaustivo">Leia o código relevante ANTES de propor. Cada etapa cita o arquivo que a justifica.</level>]]></option>
  </question>

  <!-- checkbox: aditivas, nenhuma briga com nenhuma. join="newline" porque cada
       fragmento é um elemento e eles empilham. Zero marcadas é um estado válido:
       a linha do {{secoes}} some inteira e <plan-sections/> continua XML válido. -->
  <question id="secoes" type="checkbox" join="newline"
            label="Seções obrigatórias no plano"
            help="Cada marcada vira uma seção que o agente é obrigado a preencher.">
    <option value="riscos" label="Riscos e o sinal de cada um" default="true"><![CDATA[<section id="riscos">O que pode dar errado, o sinal que denuncia cada caso e o que fazer quando ele aparecer.</section>]]></option>
    <option value="aceite" label="Critérios de aceite" default="true"><![CDATA[<section id="criterios-de-aceite">Como saber que terminou: um critério verificável por etapa, sem adjetivo.</section>]]></option>
    <option value="rollback" label="Rollback"><![CDATA[<section id="rollback">Como desfazer cada etapa, e qual é a última em que ainda dá para desistir barato.</section>]]></option>
  </question>

  <!-- O que não virou pergunta: o protocolo. A resposta é sempre a mesma, então
       ele é texto fixo do esqueleto. Cada {{...}} está sozinho na linha — é essa
       posição que liga a indentação automática e a regra da linha vazia. -->
  <template><![CDATA[
    <task type="planning">

      <objective>
        {{alvo}}
      </objective>

      <context>
        {{contexto}}
      </context>

      <depth>
        {{profundidade}}
      </depth>

      <plan-sections>
        {{secoes}}
      </plan-sections>

      <protocol>
        <step n="1">Antes de propor, liste os arquivos que o plano vai tocar.</step>
        <step n="2">Não escreva código de produção nesta etapa. O entregável é o plano.</step>
        <step n="3">Marque o que você NÃO verificou.</step>
      </protocol>

    </task>
  ]]></template>

</prompt-builder>
```

Com os padrões, o `{{profundidade}}` entrega duas linhas — `<level>` e `<budget>` — e as duas saem
com os quatro espaços do marcador, não só a primeira. Desmarcando as três seções, a linha do
`{{secoes}}` desaparece e sobra um `<plan-sections>` vazio em duas linhas: continua XML bem
formado, que é o teste que importa. (A indentação do `<template>` dentro da spec não vaza para o
prompt: o runtime tira a indentação **comum** antes de montar.)

## Armadilhas de runtime

A história de cada uma está em `references/pitfalls.md`. O resumo, para conferir contra o sintoma:

| Sintoma | Causa | Correção |
|---|---|---|
| o botãozinho de hover copia sempre o prompt inicial | o runtime do template cacheou o texto no `load` | `<pre data-live>` em volta da saída |
| *"Element previously highlighted"* no console em **toda** carga | o construtor destacou antes do `highlightAll` pendente | não destacar quando `readyState === 'loading'` (v1.1 §5) |
| o mesmo aviso, mas só ao clicar | `hljs` recusa re-destacar | `delete code.dataset.highlighted` antes de `highlightElement` |
| a aba abre vazia e o console está limpo | XML inválido: `DOMParser` devolve `<parsererror>` em vez de lançar | checar `doc.querySelector('parsererror')` |
| a spec sai cortada no meio e o HTML se desfaz | um `</script>` literal dentro da spec | não escrever a sequência; nem CDATA protege |
| o leitor de tela relê o prompt inteiro a cada clique | `aria-live` no bloco de código | `aria-live` numa frase curta de status, fora do `<pre>` |
| o handler morre na primeira linha, em aba anônima | `localStorage` estoura `SecurityError` | `try/catch` na leitura **e** na escrita |
| as tags do prompt somem da tela | `innerHTML` interpretou o XML | `textContent`, sempre |

## Antes de entregar — checklist

- [ ] `check-doc.mjs` passou sem erro.
- [ ] O `<code data-pb-output>` foi **regerado** a partir da spec atual e escapado — não copiado de
      lugar nenhum.
- [ ] As duas regras de `@media print` e o `style` do `<pre>` foram junto com os três blocos
      marcados.
- [ ] O `pb:runtime` é o **último** `<script>` do arquivo, depois do runtime do template.
- [ ] Cliquei em **todas** as opções e olhei o prompt: fragmento multi-linha desalinhado aparece na
      hora.
- [ ] Desmarquei uma pergunta de `checkbox` inteira: o que sobrou ainda é XML bem formado.
- [ ] O console está limpo — nenhum aviso do `hljs`, nenhum `SyntaxError`.
- [ ] **Restaurar padrões** devolve exatamente o prompt que está pré-preenchido no HTML.
- [ ] Copiei e colei num agente de verdade. Prompt que ninguém testou é prompt que não existe.
- [ ] Imprimi para PDF: o prompt sai inteiro, não cortado na altura da caixa.
