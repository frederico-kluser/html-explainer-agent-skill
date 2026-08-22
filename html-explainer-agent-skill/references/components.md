# Componentes — o que usar para cada coisa

Antes de escrever CSS, procure aqui. Todos funcionam com `data-bs-theme="dark"` sem ajuste.

| Quero… | Use | Não use |
|---|---|---|
| Destacar um aviso | `alert` | negrito e cor na mão |
| Detalhe longo que nem todo mundo lê | `accordion` | outra aba |
| Esconder/mostrar um trecho curto | `collapse` | `accordion` de um item |
| Agrupar assunto dentro da aba | `card` | `<div>` com borda própria |
| Comparar valores | `<table class="table">` | duas colunas de texto |
| Etiquetar (versão, status, contagem) | `badge` | parênteses no texto |
| Passos numerados | `list-group` ou `<ol>` | abas |
| Índice que acompanha a rolagem | `nav` + scrollspy | nada |
| Glossário / nota lateral | `offcanvas` | rodapé |
| Percentual, cobertura, maturidade | `progress` | "cerca de 70%" |
| Tecla do teclado | `<kbd>` | `código` |
| Termo com definição | `<dl>` | lista com travessão |

## Alerts — o único jeito de destacar

Quatro variantes, quatro significados. Não invente uma quinta.

```html
<div class="alert alert-primary d-flex gap-2" role="alert">
  <i class="bi bi-info-circle-fill flex-shrink-0"></i>
  <div><strong>Contexto:</strong> informação que ajuda, mas não muda o que fazer.</div>
</div>

<div class="alert alert-warning d-flex gap-2" role="alert">
  <i class="bi bi-exclamation-triangle-fill flex-shrink-0"></i>
  <div><strong>Cuidado:</strong> vai dar errado se você fizer do jeito óbvio.</div>
</div>

<div class="alert alert-danger d-flex gap-2" role="alert">
  <i class="bi bi-x-octagon-fill flex-shrink-0"></i>
  <div><strong>Destrutivo:</strong> apaga dados, derruba produção, não tem volta.</div>
</div>

<div class="alert alert-success d-flex gap-2" role="alert">
  <i class="bi bi-check-circle-fill flex-shrink-0"></i>
  <div><strong>Recomendado:</strong> é este o caminho.</div>
</div>
```

`role="alert"` só nos que realmente alertam (warning/danger). Em `alert-primary` puramente
informativo ele faz leitor de tela interromper a leitura à toa.

**Três alerts seguidos não destacam nada.** Se tudo é importante, nada é: escolha um.

## Accordion — para o que é opcional

```html
<div class="accordion" id="acc-detalhes">
  <div class="accordion-item">
    <h3 class="accordion-header">
      <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
              data-bs-target="#acc-1" aria-expanded="false" aria-controls="acc-1">
        Por que o cache invalida por hash e não por data?
      </button>
    </h3>
    <div id="acc-1" class="accordion-collapse collapse" data-bs-parent="#acc-detalhes">
      <div class="accordion-body">Resposta.</div>
    </div>
  </div>
</div>
```

`data-bs-parent` faz abrir um fechar o outro. **Tire** se quiser vários abertos ao mesmo tempo —
em FAQ que a pessoa vai comparar, tirar é melhor.

O primeiro item aberto: no `<button>` remova `collapsed` e ponha `aria-expanded="true"`; no `<div>`
troque `collapse` por `collapse show`.

**Accordion × aba:** aba é *ou isto ou aquilo* (eixos paralelos); accordion é *tudo isto, mas nem
tudo interessa agora* (detalhe opcional). Não empilhe abas dentro de accordion.

## Tabelas

```html
<div class="table-responsive">
  <table class="table table-hover align-middle">
    <thead><tr><th scope="col">Opção</th><th scope="col">Custo</th><th scope="col">Quando</th></tr></thead>
    <tbody>
      <tr><th scope="row">A</th><td>baixo</td><td>protótipo</td></tr>
    </tbody>
  </table>
</div>
```

- **`table-responsive` sempre.** Sem ele, tabela larga estoura o layout no celular.
- **Nada de `table-dark`.** Com `data-bs-theme="dark"` a `table` já é escura; `table-dark` empilha
  escuro sobre escuro e some o contraste.
- `scope="col"` / `scope="row"`: é o que faz leitor de tela dizer "Custo: baixo" em vez de "baixo".
- `table-striped` só em tabela de dados longa. Em tabela de 3 linhas, é ruído.
- Célula com código: `<td><code>--flag</code></td>` — não use `<pre>` dentro de `<td>`.

## Cards

```html
<div class="row row-cols-1 row-cols-md-2 g-3">
  <div class="col">
    <div class="card h-100">
      <div class="card-body">
        <h3 class="card-title h6">Título</h3>
        <p class="card-text text-body-secondary small mb-0">Uma ideia por card.</p>
      </div>
    </div>
  </div>
</div>
```

`h-100` no card + `g-3` na row: sem isso os cards da mesma linha saem com alturas diferentes.

## Badges

```html
<span class="badge text-bg-secondary">v5.3.8</span>
<span class="badge text-bg-success">estável</span>
<span class="badge text-bg-warning">experimental</span>
<span class="badge text-bg-danger">removido</span>
<span class="badge rounded-pill text-bg-info">3</span>
```

`text-bg-*` (não `bg-*`): ele ajusta a cor do texto junto e mantém o contraste no tema escuro.

## Índice lateral com scrollspy

Para documento longo dentro de uma aba:

```html
<div class="row">
  <div class="col-lg-9" data-bs-spy="scroll" data-bs-target="#toc" data-bs-smooth-scroll="true" tabindex="0">
    <h2 id="s1">Primeira</h2><p>…</p>
    <h2 id="s2">Segunda</h2><p>…</p>
  </div>
  <nav class="col-lg-3 d-none d-lg-block">
    <div class="position-sticky" style="top: 5rem">
      <div class="text-uppercase small text-body-secondary mb-2">Nesta página</div>
      <nav id="toc" class="nav flex-column border-start">
        <a class="nav-link py-1 px-3" href="#s1">Primeira</a>
        <a class="nav-link py-1 px-3" href="#s2">Segunda</a>
      </nav>
    </div>
  </nav>
</div>
```

O scrollspy exige `tabindex="0"` no elemento observado e `id` em cada alvo. Em painel escondido ele
não mede nada (`display: none`) — se cada aba tiver seu índice, chame
`bootstrap.ScrollSpy.getOrCreateInstance(el).refresh()` no `shown.bs.tab`.

## Collapse solto — "mostrar o log inteiro"

```html
<button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse"
        data-bs-target="#log" aria-expanded="false" aria-controls="log">
  Ver saída completa
</button>
<div class="collapse mt-2" id="log">
  <pre><code class="nohighlight">…200 linhas…</code></pre>
</div>
```

Melhor que aba para "o detalhe que quase ninguém quer".

## Offcanvas — glossário sem sair da página

```html
<button class="btn btn-sm btn-outline-info" data-bs-toggle="offcanvas" data-bs-target="#glossario">
  Glossário
</button>
<div class="offcanvas offcanvas-end" tabindex="-1" id="glossario" aria-labelledby="glossario-t">
  <div class="offcanvas-header">
    <h5 class="offcanvas-title" id="glossario-t">Glossário</h5>
    <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fechar"></button>
  </div>
  <div class="offcanvas-body">
    <dl><dt>Idempotente</dt><dd>Rodar duas vezes dá o mesmo resultado de rodar uma.</dd></dl>
  </div>
</div>
```

## Progress

```html
<div class="d-flex align-items-center gap-2">
  <div class="progress flex-grow-1" role="progressbar" aria-label="Cobertura"
       aria-valuenow="72" aria-valuemin="0" aria-valuemax="100" style="height: .5rem">
    <div class="progress-bar bg-success" style="width: 72%"></div>
  </div>
  <span class="small text-body-secondary">72%</span>
</div>
```

## Impressão: use os utilitários, não uma classe sua

O Bootstrap 5.3 já tem uma família `d-print-*` (`d-print-none`, `d-print-block`, `d-print-inline`,
`d-print-flex`, `d-print-table`…). Combine com as de tela para os três padrões que documento precisa:

| Quero | Classe |
|---|---|
| Some no papel (navbar, botão, aviso interativo) | `d-print-none` |
| Só no papel (rodapé com URL, aviso de versão impressa) | `d-none d-print-block` |
| Aparece nos dois | (nada) |

O bloco `@media print` do template continua necessário para uma coisa só, que utilitário nenhum faz:
**desdobrar os `.tab-pane` escondidos**.

## Callout não existe no Bootstrap distribuído

Você vai ver `.callout`, `.callout-info` e `.callout-warning` na documentação do próprio Bootstrap —
mas eles são um componente que o time escreveu **para o site de docs**, e não estão no
`bootstrap.min.css`. Usar num documento seu produz um `<div>` sem estilo nenhum. Para destaque, é
`alert`.

## HTML puro que já resolve

Não existe componente Bootstrap para isso porque o HTML já tem:

```html
Pressione <kbd>Ctrl</kbd> + <kbd>C</kbd> para interromper.
O <abbr title="Subresource Integrity">SRI</abbr> confere o hash do arquivo.
<mark>Este trecho</mark> é o que muda.
<dl class="row">
  <dt class="col-sm-3">Idempotente</dt>
  <dd class="col-sm-9">Rodar duas vezes dá o mesmo que rodar uma.</dd>
</dl>
<figure>
  <blockquote class="blockquote"><p>Citação.</p></blockquote>
  <figcaption class="blockquote-footer">Autor em <cite title="Fonte">Fonte</cite></figcaption>
</figure>
```

## Cor e espaçamento: use os tokens

| Em vez de | Use |
|---|---|
| `style="color: #aaa"` | `class="text-body-secondary"` |
| `style="background: #1a1a1a"` | `class="bg-body-tertiary"` |
| `style="border: 1px solid #333"` | `class="border"` |
| `style="margin-bottom: 1rem"` | `class="mb-3"` |
| `style="display:flex; gap:.5rem"` | `class="d-flex gap-2"` |
| `style="font-family: monospace"` | `class="font-monospace"` |
| `style="font-size: .875rem"` | `class="small"` |

Escala de espaçamento: `0 · 1 (.25rem) · 2 (.5rem) · 3 (1rem) · 4 (1.5rem) · 5 (3rem)`, com os
prefixos `m`/`p` + `t b s e x y`. `mt-3`, `px-4`, `my-5`.

Precisando mesmo de uma cor fora da paleta, use a variável do tema — `var(--bs-border-color)`,
`var(--bs-body-color)`, `var(--bs-secondary-bg)` — nunca hex cravado. Hex é o que faz o documento
parecer dois documentos.
