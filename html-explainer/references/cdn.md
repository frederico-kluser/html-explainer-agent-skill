# CDN — URLs, versões e SRI

Tudo aqui foi baixado e conferido em **2026-07-29**. Os `integrity` são o SHA-384 real do arquivo
naquela URL: copie o par URL+hash junto, nunca um sem o outro.

## O bloco padrão (copie inteiro)

No `<head>`:

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css"
      integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB"
      crossorigin="anonymous">
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css"
      integrity="sha384-CK2SzKma4jA5H/MXDUU7i1TqZlCFaD4T01vtyDFvPlD97JQyS+IsSh1nI2EFbpyk"
      crossorigin="anonymous">
<link rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css"
      integrity="sha384-wH75j6z1lH97ZOpMOInqhgKzFkAInZPPSPlZpYKYTOqsaizPvhQZmAtLcPKXpLyH"
      crossorigin="anonymous">
```

Antes do `</body>`:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js"
        integrity="sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI"
        crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"
        integrity="sha384-RH2xi4eIQ/gjtbs9fUXM68sLSi99C7ZWBRX1vDrVv6GQXRibxXLbwO2NGZB74MbU"
        crossorigin="anonymous"></script>
```

**`bootstrap.bundle.min.js`, não `bootstrap.min.js`.** O bundle já traz o Popper embutido; o outro
não, e dropdown, tooltip e popover morrem em silêncio. Abas funcionam nos dois, mas escolher o
bundle evita o dia em que você adiciona um tooltip e não entende o erro.

## Tabela de referência

| Pacote | Versão | URL | SRI (sha384-…) |
|---|---|---|---|
| Bootstrap CSS | 5.3.8 | `cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css` | `sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB` |
| Bootstrap JS bundle | 5.3.8 | `cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js` | `FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI` |
| Bootstrap Icons | 1.13.1 | `cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css` | `CK2SzKma4jA5H/MXDUU7i1TqZlCFaD4T01vtyDFvPlD97JQyS+IsSh1nI2EFbpyk` |
| highlight.js core+comuns | 11.11.1 | `cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js` | `RH2xi4eIQ/gjtbs9fUXM68sLSi99C7ZWBRX1vDrVv6GQXRibxXLbwO2NGZB74MbU` |
| tema `github-dark` | 11.11.1 | `…/11.11.1/styles/github-dark.min.css` | `wH75j6z1lH97ZOpMOInqhgKzFkAInZPPSPlZpYKYTOqsaizPvhQZmAtLcPKXpLyH` |
| tema `atom-one-dark` | 11.11.1 | `…/11.11.1/styles/atom-one-dark.min.css` | `oaMLBGEzBOJx3UHwac0cVndtX5fxGQIfnAeFZ35RTgqPcYlbprH9o9PUV/F8Le07` |
| tema `base16/tomorrow-night` | 11.11.1 | `…/11.11.1/styles/base16/tomorrow-night.min.css` | `WbNVV+KIc7P0ZXROPJq26AcBblo1ElJAYZGbof1LRa6lkmzmaESyHiDjKCS2MrwU` |
| linguagem avulsa (ex. dockerfile) | 11.11.1 | `…/11.11.1/languages/dockerfile.min.js` | `hly+Rz036+A3/domxShxHoja13X3lfx8nyG3V8aMeOe7Efwu6gUaSrDxq9BKwYk4` |
| Mermaid (UMD) | 11.16.0 | `cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.min.js` | `T/0lMUdJpd2S1ZHtRiofG3htU3xPCrFVeAQ1UUE2TJwlEJSV5NUwn30kP28n238E` |
| Prism core | 1.30.0 | `cdn.jsdelivr.net/npm/prismjs@1.30.0/prism.min.js` | `guvyurEPUUeAKyomgXWf/3v1dYx+etnMZ0CeHWsUXSqT1sRwh4iLpr9Z+Lw631fX` |
| Prism tema `tomorrow` | 1.30.0 | `…/prismjs@1.30.0/themes/prism-tomorrow.min.css` | `wFjoQjtV1y5jVHbt0p35Ui8aV8GVpEZkyF99OXWqP/eNJDU93D3Ugxkoyh6Y2I4A` |
| Prism toolbar (js/css) | 1.30.0 | `…/plugins/toolbar/prism-toolbar.min.js` · `.css` | `jC1G68eGEXJpPwMDNqyIUQsQlcUCdCU+a7GGuoV4TUZvM1gLYTMJUDvqBnxtZLWA` · `EUzJ34/1CCeefTGUKLgvA5Z/vYIwi+Jyu8aAaCfFDxfwZ3Xs3OfkkIeegsLRM11e` |
| Prism copy-to-clipboard | 1.30.0 | `…/plugins/copy-to-clipboard/prism-copy-to-clipboard.min.js` | `ZdEfx8sYX8i4IVXU1tUbqwOp4PBUCCmnpagpiHchnstXkEczkzPfUd9fvBrntM+F` |
| Prism autoloader | 1.30.0 | `…/plugins/autoloader/prism-autoloader.min.js` | `Uq05+JLko69eOiPr39ta9bh7kld5PKZoU+fF7g0EXTAriEollhZ+DrN8Q/Oi8J2Q` |
| highlightjs-copy (js/css) | 1.0.6 | `cdn.jsdelivr.net/npm/highlightjs-copy@1.0.6/dist/highlightjs-copy.min.js` · `.css` | `0/jh9+ifwJ5mqtDZ+DWdwgFjZ8I4HIfXqaWJi2mdeAwy8aUPlw5dTYNsqAqNE4yD` · `jx4j2QNE8PcYHQikjfTfY6TM0sYVodTr0OGqUfAR6bKYJBgW91lTieqkghTu9+Kk` |

## SRI — o que dá errado

`integrity` sem `crossorigin="anonymous"` **bloqueia o recurso**. A verificação exige uma resposta
CORS legível; sem o atributo, a resposta é opaca, o navegador não consegue conferir o hash e
descarta o arquivo. Página fica sem estilo, console mostra erro de CORS, e a causa parece não ter
relação com o `integrity`.

**Versão flutuante e SRI são incompatíveis.** `bootstrap@5` e `bootstrap@latest` resolvem para o
patch mais novo; no dia do release o conteúdo muda, o hash não bate e o documento abre em branco.
Trave `5.3.8`. Este é o motivo real da regra "versão exata" — não é purismo.

Gerar o hash de qualquer URL:

```bash
curl -sL "<url>" | openssl dgst -sha384 -binary | openssl base64 -A
```

## Qual CDN

| | Quando usar |
|---|---|
| **jsDelivr** (`cdn.jsdelivr.net/npm/<pkg>@<ver>/<caminho>`) | Padrão. Serve qualquer pacote npm no caminho que ele tem no pacote — sem precisar que alguém tenha "publicado" ali. É o CDN que a própria documentação do Bootstrap usa. |
| **cdnjs** (`cdnjs.cloudflare.com/ajax/libs/<lib>/<ver>/<arquivo>`) | Catálogo curado, com caminhos mais curtos. Melhor para highlight.js, porque o build de CDN dele (core + linguagens comuns) já vem pronto — no npm o pacote é fonte, não bundle. Só existe o que foi curado. |
| **unpkg** (`unpkg.com/<pkg>@<ver>/<caminho>`) | Equivalente ao jsDelivr; use como plano B se um caminho específico não resolver. |
| **esm.sh** (`esm.sh/<pkg>@<ver>`) | Só quando você precisa de **ESM** de um pacote que não publica UMD. Ele reescreve os imports internos para outras URLs — e aí o SRI só cobre o arquivo de entrada, não o resto. |

Regra prática: **Bootstrap por jsDelivr, highlight.js por cdnjs.** É o caminho mais testado de cada um.

## Adicionar uma linguagem ao highlight.js

O build de CDN traz ~38 linguagens comuns (js, ts, python, bash, json, xml/html, css, sql, java, go,
rust, php, ruby, c, cpp, csharp, yaml, markdown, diff…). Fora dessa lista — `dockerfile`, `nginx`,
`hcl`, `graphql`, `powershell`, `lua`, `vim`, `scala`, `elixir` — inclua o arquivo da linguagem
**depois** do `highlight.min.js` e **antes** de chamar `hljs.highlightAll()`:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/dockerfile.min.js"
        integrity="sha384-hly+Rz036+A3/domxShxHoja13X3lfx8nyG3V8aMeOe7Efwu6gUaSrDxq9BKwYk4"
        crossorigin="anonymous"></script>
```

Precisando de muitas linguagens de uma vez, troque o core pelo bundle completo — pesa bem mais,
então só faça se realmente precisar:

```
https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.11.1/highlight.min.js
```

Verificar se uma linguagem carregou, no console: `hljs.listLanguages()`.

## Antes de publicar: reconfira

Versões envelhecem. Para atualizar a tabela, rode e substitua:

```bash
for u in <url1> <url2>; do
  printf '%s\n  sha384-%s\n' "$u" "$(curl -sL "$u" | openssl dgst -sha384 -binary | openssl base64 -A)"
done
```

E a versão corrente de um pacote:

```bash
curl -s https://registry.npmjs.org/bootstrap/latest | python3 -c 'import sys,json;print(json.load(sys.stdin)["version"])'
```
