# Abas — markup, acessibilidade e truques

## O markup canônico

```html
<ul class="nav nav-tabs" id="doc-tabs" role="tablist">
  <li class="nav-item" role="presentation">
    <button class="nav-link active" id="tab-a" data-bs-toggle="tab" data-bs-target="#pane-a"
            type="button" role="tab" aria-controls="pane-a" aria-selected="true">Rótulo A</button>
  </li>
  <li class="nav-item" role="presentation">
    <button class="nav-link" id="tab-b" data-bs-toggle="tab" data-bs-target="#pane-b"
            type="button" role="tab" aria-controls="pane-b" aria-selected="false">Rótulo B</button>
  </li>
</ul>

<div class="tab-content">
  <div class="tab-pane fade show active" id="pane-a" role="tabpanel" aria-labelledby="tab-a" tabindex="0">…</div>
  <div class="tab-pane fade"             id="pane-b" role="tabpanel" aria-labelledby="tab-b" tabindex="0">…</div>
</div>
```

Os cinco elos que precisam fechar — quebrar qualquer um deixa a aba muda ou abre a errada:

1. `role="tablist"` no `<ul>`, `role="presentation"` em cada `<li>` (o `<li>` não é o tab; o botão é).
2. `role="tab"` no gatilho, `role="tabpanel"` no painel.
3. `data-bs-target="#pane-a"` **com** `#` ↔ `aria-controls="pane-a"` **sem** `#`. Erro clássico.
4. `id` do gatilho ↔ `aria-labelledby` do painel.
5. Exatamente **um** gatilho `.active` e **um** painel `.show.active` por grupo.

Mais três detalhes que só aparecem depois:

- **`fade` exige `show` E `active`** no painel inicial. Só `active` renderiza com `opacity: 0` —
  a aba "abre" vazia e ninguém entende.
- **`type="button"`** no `<button>`. Sem isso, dentro de um `<form>` o padrão é `submit` e o clique
  recarrega a página.
- **`tabindex="0"` no painel.** Painel com texto longo e nada focável dentro é inalcançável por
  teclado sem isso: a pessoa troca de aba e não consegue rolar o conteúdo.

## Teclado: já vem pronto

Do Bootstrap 5.2 em diante o `tab.js` implementa a navegação de teclado do padrão ARIA no
`role="tablist"`: **← ↑** vão para a anterior, **→ ↓** para a próxima, **Home/End** para a
primeira/última, e a lista **circula** (da última, → volta para a primeira). A ativação é
automática: mover o foco já mostra o painel. Não escreva `keydown` próprio — você só vai brigar com
o que já existe.

Detalhe importante: as abas **não ativadas** ficam com `tabindex="-1"`, então **Tab** pula direto da
aba ativa para o conteúdo. É o comportamento correto do padrão, não um bug.

## Aba pelo #hash da URL

Está no runtime do `template.html` e resolve os dois sentidos. Dois pontos que valem entender:

```js
// escrever: replaceState, nunca location.hash — atribuir o hash faz o navegador
// rolar até o elemento e a página "pula" a cada troca de aba.
history.replaceState(null, '', '#' + id);
```

```js
// ler: o hash pode apontar para o painel OU para um <h2> dentro dele.
const pane = document.querySelector(hash)?.closest('.tab-pane');
bootstrap.Tab.getOrCreateInstance(trigger).show();
```

`getOrCreateInstance` em vez de `new bootstrap.Tab(el)`: criar uma segunda instância no mesmo
elemento gera dois listeners e o `shown.bs.tab` dispara em dobro.

Use `pushState` no lugar de `replaceState` só se quiser que o **Voltar** do navegador desfaça a troca
de aba. Em documento de leitura isso costuma irritar — cada clique vira uma entrada no histórico.

## Variantes

**Pills verticais** — aguentam mais itens que `nav-tabs` e viram um índice lateral:

```html
<div class="d-flex align-items-start gap-3">
  <div class="nav flex-column nav-pills" role="tablist" aria-orientation="vertical" style="min-width: 12rem">
    <button class="nav-link active text-start" id="t1" data-bs-toggle="pill" data-bs-target="#p1"
            type="button" role="tab" aria-controls="p1" aria-selected="true">Primeiro</button>
    …
  </div>
  <div class="tab-content flex-grow-1">…</div>
</div>
```

Ponha `aria-orientation="vertical"` — mas saiba o que ele faz e o que não faz. Ele informa a
orientação à tecnologia assistiva; **não muda o teclado**. O `tab.js` do Bootstrap 5.3.8 não lê esse
atributo em lugar nenhum do arquivo (conferido no fonte: zero ocorrências de `aria-orientation` no
bundle inteiro): as quatro setas funcionam nas duas orientações, com **→ e ↓ = próxima**, **← e ↑ =
anterior**. Não existe "teclado invertido" a consertar.

**Sublinhado (mais discreto)** — troque `nav-tabs` por `nav-underline`. Mesmo markup, sem a caixa.

**Rótulo com contagem:**

```html
<button class="nav-link" …>Armadilhas <span class="badge text-bg-danger ms-1">3</span></button>
```

**Ícone** dá orientação rápida quando há muitas abas: `<i class="bi bi-terminal me-1"></i>`. Um
ícone por aba, sempre com texto ao lado — ícone sozinho não é rótulo.

**Muitas abas no celular:** `nav-tabs` quebra em duas linhas e fica feio. Uma linha rolável:

```html
<ul class="nav nav-tabs flex-nowrap overflow-x-auto" role="tablist" style="scrollbar-width: thin">
```

## Abas aninhadas

Funcionam, com uma armadilha: `shown.bs.tab` **borbulha**. Um listener no grupo de fora recebe
também os eventos do grupo de dentro e você atualiza o hash com o painel errado.

```js
outer.addEventListener('shown.bs.tab', (e) => {
  if (e.target.closest('.tab-content')) return;   // veio de um grupo aninhado: ignore
  …
});
```

E ids: prefixe (`#pane-api-python`, não `#pane-python`) — aninhado é onde `id` duplicado mais aparece.

## Grupos de abas sincronizados

Documento com cinco exemplos, cada um em `curl / Python / TypeScript`: escolher a linguagem uma vez
deve valer para todos. Marque os grupos com `data-sync` e o rótulo de cada aba com `data-key`:

```html
<ul class="nav nav-tabs" role="tablist" data-sync="lang">
  <li class="nav-item" role="presentation">
    <button class="nav-link active" id="ex1-py" data-bs-toggle="tab" data-bs-target="#ex1-py-p"
            data-key="python" type="button" role="tab" aria-controls="ex1-py-p" aria-selected="true">Python</button>
  </li>
  …
</ul>
```

```js
// Um clique em "Python" em qualquer grupo com data-sync="lang" muda todos os outros.
document.addEventListener('shown.bs.tab', (e) => {
  const list = e.target.closest('[data-sync]');
  const key = e.target.dataset.key;
  if (!list || !key) return;
  const group = list.dataset.sync;
  document.querySelectorAll(`[data-sync="${group}"] [data-key="${key}"]`).forEach((t) => {
    // guarda contra laço infinito: só mexe em quem ainda não está ativo
    if (t !== e.target && !t.classList.contains('active')) bootstrap.Tab.getOrCreateInstance(t).show();
  });
  try { localStorage.setItem('sync:' + group, key); } catch (_) {}  // storage pode estar bloqueado
});
```

A guarda `!t.classList.contains('active')` não é opcional: sem ela, cada `show()` dispara outro
`shown.bs.tab`, que dispara outro `show()`.

O `try/catch` no `localStorage` custa nada e evita um modo de falha bobo: em navegação privativa, com
storage bloqueado por política, ou em `file://` de alguns navegadores, o acesso estoura `SecurityError`
— sem o `catch`, a exceção derruba o resto do handler e as abas param de sincronizar. (No Chromium em
`file://` funciona: todos os arquivos locais compartilham a origem `file://`. Não conte com isso.)

## Quando NÃO usar aba

- **Passo 1 → 2 → 3.** O leitor quer os três na ordem. Isso é seção com `<h2>`, ou um `accordion`
  se for muito longo.
- **Comparar lado a lado.** Aba esconde; comparação precisa de duas colunas ou uma `<table>`.
- **Coisa que precisa ser lida.** Aviso de segurança, pré-requisito, "isso apaga dados" — fora das
  abas, no topo, num `alert`.
- **Uma aba só.** Se sobrou uma, apague a estrutura.
