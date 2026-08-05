# html-explainer

Uma [Agent Skill](https://code.claude.com/docs/en/skills) que faz um agente de código **parar de
responder em Markdown** e entregar **um arquivo `.html`** — conteúdo separado em abas, tema escuro,
código destacado com botão de copiar, tudo por CDN.

Sem `npm install`, sem bundler, sem pasta de assets. Um arquivo que abre com duplo clique, vai por
anexo de e-mail e funciona offline no navegador de quem receber.

**[▶ Veja o documento de exemplo ao vivo](https://frederico-kluser.github.io/html-explainer-skill/html-explainer/assets/example.html)** — ele é a saída da skill, e explica a skill.

![exemplo](docs/preview.png)

## O problema

Markdown empilha tudo numa coluna infinita. Quando a explicação tem mais de um eixo — a visão geral,
o código, o passo a passo, as armadilhas, cada linguagem, cada ambiente — o leitor rola procurando.

**Aba é o índice que não sai da tela.** E um `.html` de arquivo único é a única forma de entregar
isso sem exigir build, servidor ou repositório do outro lado.

## O que a skill entrega

| | |
|---|---|
| **Template pronto** | `assets/template.html` — CDN com SRI conferido, estrutura de abas com ARIA correta, runtime de highlight + cópia + deep-link. Copiar e preencher. |
| **Exemplo completo** | `assets/example.html` — um documento de verdade usando todos os padrões que descreve. É a demonstração e a documentação. |
| **Linter** | `scripts/check-doc.mjs` — reprova par ARIA quebrado, duas abas ativas, `<` não escapado, versão flutuante de CDN, arquivo externo ao lado. |
| **Gerador** | `scripts/new-doc.mjs "Título" saida.html --tabs "A,B,C"` — monta a casca com os `id`/`aria-*` já pareados. |
| **Escapador** | `scripts/escape-code.mjs arquivo.ts --lines 40-58` — vira um `<pre><code>` pronto para colar. |
| **Construtor de prompt** | `assets/prompt-builder.html` — uma aba que remonta um prompt XML ao vivo a partir de perguntas em radio/checkbox. Opcional, e só sob pedido. |
| **Gerador do construtor** | `scripts/new-builder.mjs spec.xml --into doc.html` — enxerta essa aba num documento já pronto; `--force` regera, idempotente. |
| **Referências** | CDN e SRI · abas e ARIA · blocos de código · componentes Bootstrap · armadilhas · como escrever o texto. |

Tudo em `references/` é lido sob demanda: o `SKILL.md` é curto e aponta para o arquivo certo quando
o caso aparece.

## Instalação

```bash
git clone https://github.com/frederico-kluser/html-explainer-skill.git
cd html-explainer-skill
./install.sh
```

O instalador cria um **symlink** em cada diretório de agente que existir na máquina — Claude Code,
Codex, Copilot, OpenCode, Gemini CLI, Cursor. Não copia nada: editar o `SKILL.md` aqui passa a valer
na hora, em todos, sem deploy.

```bash
./install.sh --check       # o que faria, sem alterar nada
./install.sh --uninstall   # remove os links (nunca toca em diretório real)
```

Depois é só pedir em linguagem natural — *"me explica isso num HTML"*, *"monta um documento em
abas"*, *"documenta essa API"* — que a skill dispara sozinha.

## Uso direto, sem agente

Os scripts funcionam como ferramenta de linha de comando (Node ≥ 20, zero dependências):

```bash
node html-explainer/scripts/new-doc.mjs "Como o cache invalida" ./cache.html \
     --tabs "Resposta,Como funciona,Armadilhas" --sub "v3 · jul/2026"

# preencha o conteúdo…

node html-explainer/scripts/check-doc.mjs ./cache.html
```

```
✓ cache.html — sem problemas
```

O `20` do `engines` vem da suíte, não dos scripts: nenhum deles usa API posterior ao Node 18, mas
`npm test` depende do runner estável do `node --test`, que só chegou no 20.

## Construtor de prompt — opcional, e só sob pedido

Uma **aba a mais**, que remonta um prompt XML ao vivo a partir de perguntas em `radio`/`checkbox`:
o leitor clica, o bloco de código muda, o botão grande copia. Documento normal **não** tem
construtor — ele entra quando pedem "construtor de prompts", "prompt configurável", "montar o
prompt clicando".

**[▶ Veja um construtor ao vivo](https://frederico-kluser.github.io/html-explainer-skill/html-explainer/assets/prompt-builder.html)** — `assets/prompt-builder.html`, ao lado do exemplo.

Atalho de uma linha, com a spec de planejamento padrão:

```bash
node html-explainer/scripts/new-doc.mjs "Plano da migração" ./plano.html --builder
```

```
./plano.html criado — 3 abas: #pane-visao-geral #pane-como-fazer #pane-armadilhas
  + aba "Construtor" (#pane-pb-plano) com o construtor #pb-plano — spec padrão (planejamento)
```

Ou o fluxo mais comum — documento primeiro, construtor depois, com as perguntas que o caso pede:

```bash
node html-explainer/scripts/new-builder.mjs --example > spec.xml   # edite as perguntas
node html-explainer/scripts/new-builder.mjs spec.xml --into ./plano.html
node html-explainer/scripts/check-doc.mjs ./plano.html
```

```
./plano.html — aba "Construtor" (#pane-pb-revisao) com o construtor #pb-revisao
```

**Os dois caminhos não dão o mesmo `id`, e isso é esperado.** `--builder` sem `--spec` usa a spec
padrão de planejamento e produz `#pane-pb-plano`; a spec de `--example` declara `id="revisao"` e
produz `#pane-pb-revisao`. O `id` sai da spec, não do comando.

## O que está dentro do documento gerado

- `<html data-bs-theme="dark">` + `<meta name="color-scheme" content="dark">` — escuro de verdade,
  sem flash branco e sem alternador de tema.
- **Bootstrap 5.3.8** por jsDelivr, **highlight.js 11.11.1** por cdnjs, ambos com `integrity` +
  `crossorigin` e **versão travada** — versão flutuante quebra o SRI no dia do release.
- **Botão de copiar** em cada bloco, com `navigator.clipboard` quando há contexto seguro e fallback
  `execCommand` quando não há. O texto cru é capturado *antes* do highlight, para não colar os
  números de linha junto.
- **Aba ↔ URL nos dois sentidos**: `arquivo.html#pane-armadilhas` abre naquela aba; trocar de aba
  atualiza o hash sem fazer a página pular.
- **Impressão com todas as abas abertas** — sem isso, o PDF de um documento de 5 abas sai com 1.

## Verificado, não presumido

Os números da documentação foram medidos em Chromium/Brave sobre `file://`, não copiados de blog.
Três exemplos:

- **Diagrama em aba escondida quebra.** Mermaid 11.16, dois diagramas idênticos: no painel visível o
  SVG sai com `viewBox="0 0 340.45 70"`; no painel escondido, `viewBox="-8 -8 16 16"` — uma caixa de
  16×16, porque `getBBox()` devolve zero dentro de `display: none`. A correção (renderizar no
  `shown.bs.tab`) está no exemplo e devolve `viewBox="0 0 332.75 70"`.
- **`file://` é contexto seguro no Chromium** — `window.isSecureContext === true` e
  `navigator.clipboard` existe. O fallback do botão de copiar continua necessário, mas por causa de
  `http://` em IP de rede local, não do `file://`. Metade dos tutoriais erra nisso.
- **O construtor não mente para quem não tem JavaScript.** O prompt que já está no bloco antes de
  qualquer clique — o que sai no PDF e o que vê quem abriu com JS desligado — é **byte a byte** o
  que o construtor entrega no primeiro clique: 1086 bytes idênticos dos dois lados, em `file://` e
  em `http://`. Não é coincidência mantida à mão: é o próprio runtime do documento que calcula esse
  texto na hora de gerar o arquivo, e o teste morre se um caractere ou um espaço de indentação
  divergir.

## Quando *não* usar

Página de produto, landing, aplicação com estado, site com build — e o caso em que o arquivo vai
virar `README.md` ou entrar em `docs/`. Na dúvida entre `.md` e `.html`: se é para **ler**, HTML;
se é para **versionar e revisar em PR**, Markdown.

## Licença

MIT.
