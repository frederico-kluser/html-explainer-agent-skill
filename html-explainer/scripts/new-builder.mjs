#!/usr/bin/env node
/**
 * new-builder.mjs — transforma uma spec XML numa aba de construtor de prompt.
 *
 *   node new-builder.mjs --example > spec.xml        # spec de partida, comentada
 *   node new-builder.mjs spec.xml                    # bloco pronto para colar, no stdout
 *   node new-builder.mjs spec.xml --into doc.html    # acrescenta a aba a um documento existente
 *
 * Os três blocos (spec, casca e runtime) saem de assets/prompt-builder.html, a implementação
 * de REFERÊNCIA — este script não reimplementa nada do runtime. O contrato normativo está em
 * references/prompt-builder.md; mudar um nome de atributo aqui quebra o linter junto.
 *
 * O ponto delicado é o <code data-pb-output> pré-preenchido: ele existe para que quem abre sem
 * JavaScript, e quem imprime em PDF, receba o MESMO prompt que o construtor entrega. Por isso
 * ele é RECALCULADO para cada spec — rodando o próprio runtime da referência dentro do Node,
 * nunca uma segunda implementação da montagem, que divergiria no primeiro caso de borda.
 */

import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REFERENCE = resolve(HERE, '..', 'assets', 'prompt-builder.html');

/** Erro que é culpa do input, não do script: sai como mensagem limpa, sem stack. */
export class PbError extends Error {}
const die = (msg, hint) => { throw new PbError(hint ? `${msg}\n  ↳ ${hint}` : msg); };

const ID_RE = /^[a-z][a-z0-9-]*$/;
const TYPES = ['radio', 'checkbox', 'text', 'textarea'];
const JOINS = ['newline', 'blank-line', 'comma', 'space'];

/** Escape do miolo de <code>: só & < >, exatamente como a referência (aspas ficam cruas). */
const escCode = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Escape de valor de atributo e de texto curto. */
const escAttr = (s) => escCode(s).replace(/"/g, '&quot;');

// ── extração dos blocos da referência ────────────────────────────────────────

/** Miolo entre <!-- pb:NOME:begin --> e <!-- pb:NOME:end -->, sem as quebras das pontas. */
function marked(html, name) {
  const b = `<!-- pb:${name}:begin -->`;
  const e = `<!-- pb:${name}:end -->`;
  const i = html.indexOf(b);
  const j = html.indexOf(e, i + 1);
  if (i === -1 || j === -1)
    die(`${basename(REFERENCE)} não traz mais o marcador pb:${name} — a referência mudou de forma`,
        'restaure os comentários pb:spec / pb:shell / pb:runtime em assets/prompt-builder.html');
  return html.slice(i + b.length, j).replace(/^\n/, '').replace(/\n+$/, '');
}

let _ref = null;
function reference() {
  if (_ref) return _ref;
  if (!existsSync(REFERENCE)) die(`não achei a implementação de referência em ${REFERENCE}`);
  const html = readFileSync(REFERENCE, 'utf8');
  _ref = { html, spec: marked(html, 'spec'), shell: marked(html, 'shell'), runtime: marked(html, 'runtime') };
  return _ref;
}

/** A spec de planejamento da referência, sem o <script> em volta — o padrão do --builder. */
export function defaultSpecXml() {
  const block = reference().spec;
  const a = block.indexOf('<prompt-builder');
  const b = block.lastIndexOf('</prompt-builder>');
  if (a === -1 || b === -1) die('o bloco pb:spec da referência não traz um <prompt-builder> inteiro');
  return block.slice(a, b + '</prompt-builder>'.length);
}

// ── parser XML mínimo ────────────────────────────────────────────────────────
//
// O runtime da referência parseia com DOMParser, que não existe no Node. pbModel() só usa
// getAttribute, children, tagName e textContent — então basta um parser que exponha essas
// quatro coisas. Não é um parser XML completo: é o suficiente para o esquema do contrato,
// e ele RECUSA (em vez de adivinhar) tudo que sai disso.

class XmlNode {
  constructor(tagName, line) {
    this.tagName = tagName;
    this.line = line;
    this.attrs = new Map();
    this.nodes = [];            // strings (texto/CDATA) e XmlNode, em ordem de documento
  }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  get children() { return this.nodes.filter((n) => n instanceof XmlNode); }
  get textContent() {
    return this.nodes.map((n) => (n instanceof XmlNode ? n.textContent : n)).join('');
  }
}

/** As cinco entidades que o XML define, mais as numéricas. Nada de &nbsp; — em XML não existe. */
function unescapeXml(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, ent) => {
    if (ent[0] === '#') {
      const cp = ent[1] === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : m;
    }
    const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    return Object.prototype.hasOwnProperty.call(map, ent) ? map[ent] : m;
  });
}

/* Atributos com a mesma técnica do attrsOf() do check-doc.mjs: aspas simples e duplas
   respeitadas, para que um `>` dentro do valor não corte a tag no meio. */
function parseAttrs(src, node, line) {
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const raw = m[2] ?? m[3] ?? m[4] ?? null;
    if (raw === null)
      die(`linha ${line}: atributo "${name}" de <${node.tagName}> sem valor`,
          'em XML todo atributo é nome="valor" — `default` pelado, por exemplo, o runtime lê como ausente');
    if (m[2] === undefined && m[3] === undefined)
      die(`linha ${line}: valor de "${name}" em <${node.tagName}> sem aspas`, `escreva ${name}="${raw}"`);
    if (node.attrs.has(name)) die(`linha ${line}: atributo "${name}" repetido em <${node.tagName}>`);
    node.attrs.set(name, unescapeXml(raw));
  }
}

const OPEN_TAG = /^<([A-Za-z_][\w.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/;

/** Texto XML → elemento raiz. Erro com número de linha, porque é o que o autor procura. */
export function parseXml(src) {
  const lineAt = (i) => src.slice(0, i).split('\n').length;
  const stack = [];
  let root = null;
  let i = 0;
  const push = (v) => { if (stack.length) stack[stack.length - 1].nodes.push(v); };

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) { push(unescapeXml(src.slice(i))); break; }
    if (lt > i) {
      const text = src.slice(i, lt);
      if (!stack.length && text.trim())
        die(`linha ${lineAt(i)}: texto solto fora do elemento raiz: ${JSON.stringify(text.trim().slice(0, 40))}`);
      push(unescapeXml(text));
    }
    const line = lineAt(lt);

    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt);
      if (e === -1) die(`linha ${line}: comentário sem fechamento -->`);
      i = e + 3; continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt);
      if (e === -1) die(`linha ${line}: CDATA sem fechamento ]]>`);
      push(src.slice(lt + 9, e));       // CDATA entra cru: é o fragmento XML do contrato
      i = e + 3; continue;
    }
    if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt);
      if (e === -1) die(`linha ${line}: instrução de processamento sem fechamento ?>`);
      i = e + 2; continue;
    }
    if (src.startsWith('<!', lt)) {     // DOCTYPE e afins: ignorados, como o DOMParser faz
      const e = src.indexOf('>', lt);
      if (e === -1) die(`linha ${line}: declaração sem fechamento >`);
      i = e + 1; continue;
    }
    if (src.startsWith('</', lt)) {
      const e = src.indexOf('>', lt);
      if (e === -1) die(`linha ${line}: tag de fechamento sem >`);
      const name = src.slice(lt + 2, e).trim();
      const top = stack.pop();
      if (!top) die(`linha ${line}: </${name}> fecha um elemento que nunca foi aberto`);
      if (top.tagName !== name)
        die(`linha ${line}: </${name}> fecha <${top.tagName}>, aberto na linha ${top.line}`);
      if (!stack.length) {
        if (root) die(`linha ${line}: dois elementos raiz no mesmo arquivo — o XML só admite um`);
        root = top;
      }
      i = e + 1; continue;
    }

    const m = OPEN_TAG.exec(src.slice(lt));
    if (!m) die(`linha ${line}: não consegui ler a tag em ${JSON.stringify(src.slice(lt, lt + 40))}`);
    const node = new XmlNode(m[1], line);
    parseAttrs(m[2], node, line);
    if (root && !stack.length)
      die(`linha ${line}: <${m[1]}> é um segundo elemento raiz — o XML só admite um`);
    push(node);
    if (m[3] === '/') { if (!stack.length) root = node; }
    else stack.push(node);
    i = lt + m[0].length;
  }

  if (stack.length) {
    const open = stack[stack.length - 1];
    die(`<${open.tagName}> aberto na linha ${open.line} nunca foi fechado`);
  }
  if (!root) die('a spec está vazia — esperava um elemento <prompt-builder>');
  return root;
}

// ── validação da spec ────────────────────────────────────────────────────────

/**
 * Recusa antes de escrever qualquer coisa. Junta TODOS os problemas numa mensagem só:
 * corrigir de um em um, com um erro por rodada, é o que faz a ferramenta ser abandonada.
 */
export function validateSpec(root) {
  const errs = [];
  const warns = [];
  const e = (line, msg, hint) => errs.push(`  linha ${line}: ${msg}` + (hint ? `\n      ↳ ${hint}` : ''));
  const w = (line, msg) => warns.push(`  linha ${line}: ${msg}`);

  if (root.tagName !== 'prompt-builder')
    die(`a raiz da spec é <${root.tagName}> — precisa ser <prompt-builder>`);

  const id = root.getAttribute('id');
  if (id == null)
    e(root.line, '<prompt-builder> sem id — ele é o prefixo de todo id gerado e a chave do localStorage',
      '<prompt-builder id="meu-construtor" lang="xml" title="...">');
  else if (!ID_RE.test(id))
    e(root.line, `id="${id}" inválido — use [a-z][a-z0-9-]*, que é o que vira id de elemento HTML`);

  const templates = [];
  const questions = [];
  for (const el of root.children) {
    if (el.tagName === 'template') { templates.push(el); continue; }
    if (el.tagName === 'question') { questions.push(el); continue; }
    e(el.line, `<${el.tagName}> não faz parte do esquema — o runtime o ignora em silêncio`,
      'dentro de <prompt-builder> só existem <question> e <template>');
  }

  if (!templates.length)
    e(root.line, 'spec sem <template> — não há esqueleto onde encaixar as respostas',
      'o esqueleto vai em <template><![CDATA[ ... ]]></template>');
  else if (templates.length > 1)
    e(templates[1].line, `${templates.length} elementos <template> na mesma spec — o runtime monta com o primeiro e o resto vira XML morto`);

  if (!questions.length) e(root.line, 'spec sem nenhuma <question> — o formulário abriria vazio');

  const seen = new Map();
  for (const q of questions) {
    const qid = q.getAttribute('id');
    const type = (q.getAttribute('type') || '').toLowerCase();
    const nome = qid ? `"${qid}"` : 'sem id';

    if (qid == null)
      e(q.line, '<question> sem id — sem ele não há como chamá-la de {{...}} no template');
    else if (!ID_RE.test(qid))
      e(q.line, `id de pergunta inválido "${qid}" — use [a-z][a-z0-9-]*, que é o que {{...}} e os ids gerados aceitam`);
    else if (seen.has(qid))
      e(q.line, `id de pergunta duplicado "${qid}" (também na linha ${seen.get(qid)}) — {{${qid}}} fica ambíguo`);
    else seen.set(qid, q.line);

    if (!TYPES.includes(type))
      e(q.line, `pergunta ${nome} com type="${q.getAttribute('type') ?? ''}" — só existem ${TYPES.join(', ')}`);
    if (q.getAttribute('label') == null)
      e(q.line, `pergunta ${nome} sem label — ela apareceria com a <legend> em branco`);

    const escolha = type === 'radio' || type === 'checkbox';
    const opts = q.children.filter((o) => o.tagName === 'option');
    for (const o of q.children) {
      if (o.tagName !== 'option')
        e(o.line, `<${o.tagName}> dentro da pergunta ${nome} — só <option> vive aqui`);
    }

    // join só existe em checkbox: em radio/text ele é lido e jogado fora, calado.
    const join = q.getAttribute('join');
    if (join != null) {
      if (!JOINS.includes(join))
        e(q.line, `join="${join}" na pergunta ${nome} — os únicos valores são ${JOINS.join(', ')}`,
          'newline=\\n · blank-line=\\n\\n · comma=vírgula+espaço · space=espaço');
      else if (type !== 'checkbox')
        e(q.line, `join="${join}" na pergunta ${nome}, que é ${type || 'sem type'} — join só vale em checkbox`,
          'tire o atributo, ou troque o type para checkbox');
    }

    if (!escolha) {
      // <option> em text/textarea: o runtime nem olha, e o autor fica esperando as escolhas.
      if (opts.length)
        e(opts[0].line, `pergunta ${nome} é ${type} e tem ${opts.length} <option> — o runtime desenha só a caixa de texto e ignora todas`,
          'troque o type para radio ou checkbox, ou apague as opções');
      if (q.getAttribute('placeholder') == null && q.getAttribute('default') == null && TYPES.includes(type))
        w(q.line, `pergunta ${nome} sem placeholder nem default — o campo abre vazio e sem pista do que escrever`);
      continue;
    }

    if (q.getAttribute('placeholder') != null)
      w(q.line, `placeholder na pergunta ${nome}, que é ${type} — só text/textarea têm caixa onde mostrá-lo`);
    if (q.getAttribute('default') != null)
      w(q.line, `default na pergunta ${nome}, que é ${type} — aqui o padrão vem do default="true" da <option>`);

    if (!opts.length) {
      e(q.line, `${type} ${nome} sem <option> — a pergunta aparece na tela sem nada para escolher`);
      continue;
    }

    let marcadas = 0;
    const values = new Map();
    for (const o of opts) {
      const v = o.getAttribute('value');
      if (v == null) e(o.line, `<option> da pergunta ${nome} sem value — não há como identificá-la nem salvá-la`);
      else if (values.has(v)) e(o.line, `value="${v}" repetido na pergunta ${nome} (também na linha ${values.get(v)}) — os dois <input> nasceriam com o mesmo id`);
      else values.set(v, o.line);
      if (o.getAttribute('label') == null)
        e(o.line, `<option value="${v ?? ''}"> da pergunta ${nome} sem label — a opção aparece sem rótulo clicável`);
      // O runtime marca com `getAttribute('default') === 'true'`: string exata, sem conversão.
      const d = o.getAttribute('default');
      if (d != null) {
        if (d === 'true') marcadas++;
        else if (d !== 'false')
          e(o.line, `default="${d}" na opção "${v ?? ''}" de ${nome} — o runtime só marca com a string exata "true"`,
            'escreva default="true", ou tire o atributo');
      }
    }
    if (type === 'radio' && marcadas === 0)
      e(q.line, `radio ${nome} sem nenhuma opção default="true" — o runtime cai na primeira da lista, e o padrão vira a ordem do arquivo`,
        'marque com default="true" a opção que deve vir escolhida');
    if (type === 'radio' && marcadas > 1)
      e(q.line, `radio ${nome} com ${marcadas} opções default="true" — o runtime fica com a primeira e ignora as demais, calado`);
  }

  if (questions.length > 12)
    w(questions[12].line, `${questions.length} perguntas num construtor só — acima de 12 ninguém chega ao fim do formulário`);

  // ── {{marcadores}} ↔ perguntas ──
  const ids = new Set([...seen.keys()]);
  const usados = new Set();
  if (templates.length) {
    const body = templates[0].textContent;
    for (const m of body.matchAll(/\{\{([^{}]*)\}\}/g)) {
      const nome = m[1].trim();
      usados.add(nome);
      if (!ids.has(nome))
        e(templates[0].line, `{{${m[1]}}} no <template> não casa com nenhuma pergunta — o marcador sai literal no prompt`);
    }
  }
  for (const [qid, line] of seen) {
    if (!usados.has(qid)) w(line, `a pergunta "${qid}" não aparece no <template> — quem responde escolhe e a escolha não vai para o prompt`);
  }

  if (errs.length)
    die(`spec inválida — ${errs.length} problema(s):\n${errs.join('\n')}`);
  return warns;
}

// ── o runtime da referência, rodando aqui no Node ────────────────────────────

let _pb = null;
/**
 * Instala as funções puras do runtime (parse/model/defaults/build/fragment/dedent) no
 * globalThis e devolve o objeto. O boot do DOM se auto-desliga com `if (!global.document)`,
 * então rodar o bloco aqui é seguro — e é obrigatório: uma segunda implementação da montagem
 * divergiria da primeira, e o bloco pré-preenchido passaria a mentir.
 */
export function runtimeApi() {
  if (_pb) return _pb;
  const js = reference().runtime.replace(/^<script>\n?/, '').replace(/\n?<\/script>$/, '');
  new Function(js)();
  _pb = globalThis.__promptBuilder;
  if (!_pb || typeof _pb.build !== 'function')
    die('o runtime da referência não expôs window.__promptBuilder — o bloco pb:runtime mudou de forma');
  return _pb;
}

// ── montagem dos blocos ──────────────────────────────────────────────────────

/**
 * specXml (texto do <prompt-builder>) → todos os pedaços que a aba precisa.
 * Nada de I/O aqui: quem escreve arquivo é o CLI.
 */
export function buildBlocks(specXml, opts = {}) {
  const xml = specXml.replace(/^﻿/, '').trim();
  // O bloco vai dentro de um <script>: o parser de HTML fecha no primeiro </script literal,
  // não importa que ele esteja em CDATA. É a única sequência proibida na spec inteira.
  if (/<\/script/i.test(xml))
    die('a spec traz um "</script" literal — o navegador fecharia o bloco inerte ali e o resto viraria HTML',
        'quebre em "<" + "/script" no fragmento, ou tire a citação');

  const root = parseXml(xml);
  const warnings = validateSpec(root);

  const PB = runtimeApi();
  const model = PB.model(root);
  const prompt = PB.build(model, PB.defaults(model));

  const id = model.id;
  const lang = root.getAttribute('lang') || 'xml';
  const label = opts.tabLabel || 'Construtor';
  const paneId = `pane-pb-${id}`;
  const tabId = `tab-pb-${id}`;
  const specId = `pb-spec-${id}`;
  const shellId = `pb-${id}`;

  // ── spec: reescrita a partir do XML do autor ──
  const specBlock =
`<!-- pb:spec:begin -->
<!-- A especificação do construtor. type="application/xml" é o ponto: o navegador não executa
     este bloco nem lê o conteúdo como HTML — ele fica texto cru até o fechamento do script, e
     é o DOMParser do runtime que o interpreta. A única sequência proibida aqui dentro é o
     fechamento literal de script; por isso todo fragmento vive em CDATA. -->
<script type="application/xml" id="${specId}">
${xml}
</script>
<!-- pb:spec:end -->`;

  // ── casca: cópia quase literal da referência ──
  let shell = reference().shell;
  const rootAttr = ' id="pb-plano" data-pb-spec="pb-spec-plano"';
  if (!shell.includes(rootAttr))
    die('o bloco pb:shell da referência não traz mais id="pb-plano" data-pb-spec="pb-spec-plano"',
        'a casca mudou de forma em assets/prompt-builder.html e este gerador não sabe mais o que trocar');
  shell = shell.replace(rootAttr, ` id="${shellId}" data-pb-spec="${specId}"`);

  // O <code data-pb-output> é RECALCULADO: copiá-lo da referência entregaria um documento
  // que mostra o prompt de outra spec — exatamente a mentira que este bloco existe para evitar.
  const abre = shell.indexOf('<code class="language-xml" data-pb-output>');
  const fecha = shell.indexOf('</code></pre>', abre);
  if (abre === -1 || fecha === -1)
    die('o bloco pb:shell da referência não traz mais <code class="language-xml" data-pb-output>…</code></pre>');
  shell = shell.slice(0, abre)
        + `<code class="language-${escAttr(lang)}" data-pb-output>` + escCode(prompt)
        + shell.slice(fecha);

  const linhas = prompt.split('\n').length;
  if (!/prompt padrão · \d+ linhas/.test(shell))
    die('o bloco pb:shell da referência não traz mais o texto de status "prompt padrão · N linhas"');
  shell = shell.replace(/prompt padrão · \d+ linhas/, `prompt padrão · ${linhas} linhas`);

  const shellBlock = `<!-- pb:shell:begin -->\n${shell}\n<!-- pb:shell:end -->`;

  // ── runtime: byte a byte ──
  const runtimeBlock = `<!-- pb:runtime:begin -->\n${reference().runtime}\n<!-- pb:runtime:end -->`;

  // ── CSS: o quarto ponto de injeção, o que mais se esquece ──
  // Sem estas duas regras o PDF sai com o prompt cortado nos 30rem do <pre>, e a promessa de
  // "impressão com todas as abas abertas" vira uma folha com um terço do prompt.
  const cssBlock =
`    /* pb:print:begin — no papel o prompt inteiro precisa sair: rolagem e sticky não existem em folha. */
    .prompt-builder pre { max-height: none !important; overflow: visible !important; }
    .prompt-builder .position-sticky { position: static !important; }
    /* pb:print:end */`;

  const navLi =
`<!-- pb:tab:begin ${shellId} -->
    <li class="nav-item" role="presentation">
      <button class="nav-link" id="${tabId}" data-bs-toggle="tab" data-bs-target="#${paneId}"
              type="button" role="tab" aria-controls="${paneId}" aria-selected="false">
        <i class="bi bi-sliders me-1"></i>${escAttr(label)}
      </button>
    </li>
<!-- pb:tab:end ${shellId} -->`;

  const titulo = model.title || label;
  const paneBlock =
`<!-- pb:pane:begin ${shellId} -->
    <div class="tab-pane fade" id="${paneId}" role="tabpanel"
         aria-labelledby="${tabId}" tabindex="0" data-print-title="${escAttr(label)}">
      <h2 class="h4">${escAttr(titulo)}</h2>
      <p class="mb-4">
        Responda à esquerda; o prompt à direita é remontado a cada clique e fica pronto para colar
        no agente. As respostas ficam salvas neste navegador — voltar ao arquivo devolve a última
        combinação. <strong>Restaurar padrões</strong> volta ao estado de fábrica.
      </p>

${specBlock}

${shellBlock}
    </div>
<!-- pb:pane:end ${shellId} -->`;

  return {
    id, lang, label, titulo, prompt, warnings,
    tabId, paneId, specId, shellId,
    specBlock, shellBlock, runtimeBlock, cssBlock, navLi, paneBlock,
  };
}

// ── injeção num documento existente ──────────────────────────────────────────

const ANCHORS = {
  nav: /(<ul class="nav nav-tabs" id="doc-tabs" role="tablist">[\s\S]*?)(\n  <\/ul>)/,
  pane: /(<div\b[^<>]*\bid="doc-tabs-content"[^<>]*>[\s\S]*?)(\n  <\/div>\n\n  <footer)/,
  body: /(\n)(<\/body>)/,
  print: /(\n  @media print \{[\s\S]*?)(\n  \})/,
};

const ANCHOR_HINT = {
  nav: '<ul class="nav nav-tabs" id="doc-tabs" role="tablist"> … fechado por uma linha "  </ul>"',
  pane: '<div class="tab-content …" id="doc-tabs-content"> … fechado por "  </div>" seguido de "  <footer"',
  body: 'uma linha </body> no fim do arquivo',
  print: 'um bloco "  @media print {" dentro do <style> do <head>, fechado por uma linha "  }"',
};

/**
 * Acrescenta a aba ao HTML e devolve o texto novo. Falha ALTO em vez de escrever pela metade:
 * documento sem os ganchos do §4, sem um dos quatro pontos de injeção, ou que já traz este
 * mesmo construtor — tudo isso vira erro, e o arquivo do disco não é tocado.
 */
export function injectInto(html, blocks, opts = {}) {
  const force = !!opts.force;

  // 1. Ganchos do §4. Sem eles o construtor até monta, mas o botãozinho de hover copia o
  //    prompt inicial para sempre — documento feito de uma cópia antiga do template.
  const faltando = [];
  if (!/code\.closest\(\s*['"]\[data-live\]['"]\s*\)/.test(html))
    faltando.push('  · o laço do sources.set não pula os blocos vivos.\n'
      + "      dentro de document.querySelectorAll('pre > code').forEach(...), na primeira linha:\n"
      + "        if (code.closest('[data-live]')) return;");
  if (!/__explainerCopy\s*=/.test(html))
    faltando.push('  · window.__explainerCopy não é exposto.\n'
      + '      ao final da IIFE do runtime do documento:  window.__explainerCopy = copyText;');
  if (faltando.length)
    die('o documento não tem os ganchos do §4 do contrato — provavelmente veio de uma cópia antiga do template:\n'
      + faltando.join('\n'),
        'atualize o <script> do documento a partir de assets/template.html, ou aplique as linhas acima à mão');

  // 2. Spec num <script> que o navegador EXECUTA: o bloco tem de ser inerte, senão o
  //    conteúdo é lido como JavaScript e o construtor abre vazio.
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const corpo = m[2];
    if (!/<prompt-builder\b/i.test(corpo) || !/<\/prompt-builder\s*>/i.test(corpo)) continue;
    const tipo = (/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1]) || [])
      .slice(1).find((v) => v != null);
    if ((tipo || '').toLowerCase() !== 'application/xml')
      die(`linha ${html.slice(0, m.index).split('\n').length}: já existe um <prompt-builder> num <script `
        + (tipo ? `type="${tipo}"` : 'sem type') + '> — o navegador EXECUTA esse bloco e a spec nunca chega ao DOMParser',
          'a spec vive em <script type="application/xml" id="pb-spec-XXX">');
    const roots = corpo.match(/<prompt-builder\b/gi) || [];
    if (roots.length > 1)
      die(`há ${roots.length} elementos <prompt-builder> no mesmo <script> — o DOMParser aceita um só e o resto some`,
          'um <script type="application/xml"> por construtor');
  }

  // 3. Duas cascas para a mesma spec: os ids gerados colidiriam e o segundo construtor
  //    escreveria por cima do primeiro (regra dura nº 9 da skill: id é único no documento).
  const porSpec = new Map();
  for (const m of html.matchAll(/<(\w+)\b([^<>]*\bdata-pb-spec\s*=\s*(?:"([^"]*)"|'([^']*)')[^<>]*)>/gi)) {
    const alvo = m[3] ?? m[4];
    porSpec.set(alvo, (porSpec.get(alvo) || 0) + 1);
  }
  for (const [alvo, n] of porSpec)
    if (n > 1) die(`${n} cascas apontam para a mesma spec data-pb-spec="${alvo}" — os ids gerados colidiriam`,
                   'uma casca por spec; para dois construtores, duas specs com ids diferentes');

  // 4. Este construtor já está no documento?
  const marca = `<!-- pb:pane:begin ${blocks.shellId} -->`;
  const jaTem = html.includes(marca);
  const idOcupado = new RegExp(`\\bid\\s*=\\s*"(?:${blocks.shellId}|${blocks.specId}|${blocks.paneId}|${blocks.tabId})"`).test(html);
  if (!jaTem && idOcupado)
    die(`o documento já usa algum dos ids deste construtor (#${blocks.shellId}, #${blocks.specId}, #${blocks.paneId}, #${blocks.tabId})`
      + ' — id duplicado quebra o getElementById do runtime e a navegação por #hash',
        `troque o id da raiz <prompt-builder id="${blocks.id}"> por outro`);
  if (jaTem && !force)
    die(`o documento já traz o construtor #${blocks.shellId}`,
        '--force regera a aba (o que estiver escrito dentro dela se perde)');
  if (jaTem) {
    // Remoção pelos marcadores: é o que torna o --into idempotente byte a byte.
    for (const nome of ['tab', 'pane']) {
      // As quebras que separavam o bloco do vizinho saem junto: quem reinsere põe as suas
      // de volta, e é isso que faz o --into --force ser idempotente byte a byte.
      const re = new RegExp(`\\n*<!-- pb:${nome}:begin ${blocks.shellId} -->[\\s\\S]*?<!-- pb:${nome}:end ${blocks.shellId} -->`, 'g');
      if (!re.test(html))
        die(`o construtor #${blocks.shellId} está no documento sem o marcador pb:${nome} — não sei o que remover sem risco`,
            'tire a aba antiga à mão e rode de novo');
      html = html.replace(re, '');
    }
  }

  // 5. Os quatro pontos de injeção. Todos conferidos ANTES de mexer em qualquer um.
  const ausentes = Object.keys(ANCHORS).filter((k) => !ANCHORS[k].test(html));
  const temRuntime = html.includes('<!-- pb:runtime:begin -->') || /__promptBuilder\s*=/.test(html);
  const temCss = html.includes('/* pb:print:begin');
  const precisa = ausentes.filter((k) => !(k === 'body' && temRuntime) && !(k === 'print' && temCss));
  if (precisa.length)
    die('não achei onde encaixar a aba — o documento não tem a forma que a skill produz:\n'
      + precisa.map((k) => `  · ${k}: esperava ${ANCHOR_HINT[k]}`).join('\n'),
        'gere o documento com new-doc.mjs, ou cole os blocos à mão (rode sem --into para vê-los)');

  // As quebras do fim do trecho anterior são normalizadas: sem isso o primeiro --into
  // deixaria uma linha em branco a mais do que o --force reproduz, e a idempotência morria
  // na segunda rodada — com o diff acusando um documento que ninguém editou.
  html = html.replace(ANCHORS.nav, (_, a, b) => `${a.replace(/\n+$/, '')}\n${blocks.navLi}${b}`);
  html = html.replace(ANCHORS.pane, (_, a, b) => `${a.replace(/\n+$/, '')}\n\n${blocks.paneBlock}${b}`);
  // O runtime é um só, mesmo com dois construtores: ele varre todos os .prompt-builder.
  if (!temRuntime) html = html.replace(ANCHORS.body, (_, a, b) => `${a}${blocks.runtimeBlock}\n${b}`);
  if (!temCss) html = html.replace(ANCHORS.print, (_, a, b) => `${a}\n${blocks.cssBlock}${b}`);

  return html;
}

// ── spec de exemplo ──────────────────────────────────────────────────────────

export const EXAMPLE_SPEC = `<!-- Spec de partida do construtor de prompt — contrato v1.
     ATENÇÃO ao escrever comentários aqui dentro: o linter lê este bloco cru e não pula
     comentário, então um nome de tag entre sinais de maior/menor viraria uma pergunta
     fantasma. Por isso abaixo os elementos são citados sem os sinais.

     Regras que valem a pena decorar (o resto está em references/prompt-builder.md):
       · id do prompt-builder e das question: [a-z][a-z0-9-]*. Ele prefixa todo id gerado.
       · type: radio · checkbox · text · textarea.
       · o corpo da option é o fragmento inserido; sempre em CDATA, porque é XML.
         Corpo vazio: o fragmento passa a ser o próprio value.
       · default="true" — a string exata. "1", "yes" e \`default\` pelado o runtime ignora.
         radio exige exatamente um; checkbox admite zero ou mais.
       · join (só em checkbox): newline (padrão) · blank-line · comma · space.
       · {{id}} sozinho na linha herda a indentação da linha para TODAS as linhas do fragmento,
         e se o resultado for vazio a linha inteira some.
     Depois de editar:  node new-builder.mjs esta-spec.xml --into documento.html -->
<prompt-builder id="revisao" lang="xml" title="Monte o prompt que pede a revisão">

  <question id="alvo" type="text"
            label="O que precisa ser revisado"
            help="Uma linha, com o caminho do arquivo ou o nome do módulo. É o que o agente não tem como adivinhar."
            placeholder="ex.: o parser de configuração em src/config/"
            default="O parser de configuração em src/config/"/>

  <question id="contexto" type="textarea"
            label="Contexto que só você tem"
            help="Fatos que mudam a revisão: o que já quebrou em produção, o que não pode mudar, o que é legado consciente."
            placeholder="uma afirmação por linha"
            default="O módulo é lido por quatro pacotes e dois deles rodam em CI."/>

  <question id="rigor" type="radio"
            label="Rigor da revisão"
            help="Quanto o agente deve cavar antes de apontar qualquer coisa.">
    <option value="rapida" label="Rápida — só o que salta aos olhos"><![CDATA[<level name="rapida">Aponte só o que salta aos olhos numa leitura. Não abra arquivos vizinhos.</level>]]></option>
    <option value="padrao" label="Padrão — leia o módulo inteiro" default="true"><![CDATA[<level name="padrao">Leia o módulo inteiro antes de apontar. Cada achado cita o arquivo e a linha.</level>]]></option>
    <option value="adversarial" label="Adversarial — tente quebrar"><![CDATA[<level name="adversarial">Procure ativamente o caso que quebra: entrada vazia, concorrência, erro de I/O. Cite o caminho de código que leva a cada falha.</level>]]></option>
  </question>

  <question id="focos" type="checkbox" join="newline"
            label="No que olhar"
            help="Cada marcado vira uma seção que o agente é obrigado a preencher — ou a dizer que não achou nada.">
    <option value="corretude" label="Corretude e casos de borda" default="true"><![CDATA[<focus id="corretude">Os casos de borda que o código não trata, e a entrada exata que expõe cada um.</focus>]]></option>
    <option value="seguranca" label="Segurança" default="true"><![CDATA[<focus id="seguranca">Entrada não validada, segredo em log, permissão ampla demais.</focus>]]></option>
    <option value="testes" label="Cobertura de testes"><![CDATA[<focus id="testes">O que não tem teste e deveria ter, com o nome do caso que falta.</focus>]]></option>
    <option value="desempenho" label="Desempenho"><![CDATA[<focus id="desempenho">Trabalho quadrático, I/O em laço, alocação evitável — só onde o volume real justifica.</focus>]]></option>
  </question>

  <question id="regras" type="checkbox" join="newline"
            label="Regras da revisão"
            help="Marque só as que valem de fato — regra inventada vira revisão torta.">
    <option value="sem-reescrita" label="Não reescreva o código" default="true"><![CDATA[<rule>Não reescreva o código. Aponte, explique o porquê e proponha a menor mudança que resolve.</rule>]]></option>
    <option value="severidade" label="Classifique por severidade" default="true"><![CDATA[<rule>Classifique cada achado em bloqueante, importante ou opcional, e ordene por severidade.</rule>]]></option>
    <option value="sem-estilo" label="Nada de estilo"><![CDATA[<rule>Ignore estilo e formatação: disso cuida o linter.</rule>]]></option>
  </question>

  <template><![CDATA[
    <task type="review">

      <target>
        {{alvo}}
      </target>

      <context>
        {{contexto}}
      </context>

      <depth>
        {{rigor}}
      </depth>

      <focus-areas>
        {{focos}}
      </focus-areas>

      <rules>
        {{regras}}
      </rules>

      <protocol>
        <step n="1">Leia antes de opinar. Todo achado cita arquivo e trecho.</step>
        <step n="2">Marque explicitamente o que você NÃO verificou.</step>
        <step n="3">Se não achou nada numa seção, diga isso em vez de inventar achado.</step>
      </protocol>

    </task>
  ]]></template>

</prompt-builder>
`;

// ── CLI ──────────────────────────────────────────────────────────────────────

const USO = `uso:
  node new-builder.mjs --example > spec.xml                  spec de partida, comentada
  node new-builder.mjs spec.xml                              blocos prontos para colar, no stdout
  node new-builder.mjs spec.xml --into doc.html [--force]    acrescenta a aba ao documento

opções:
  --tab-label "..."   rótulo da aba (padrão: "Construtor")
  --force             com --into, regera a aba deste construtor se ela já existir`;

function main(argv) {
  const TAKES_VALUE = ['--into', '--tab-label'];
  const flag = (n, d = null) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (TAKES_VALUE.includes(argv[i])) { i++; continue; }   // pula a flag e o valor dela
    if (argv[i].startsWith('--')) continue;                 // flag booleana: --example, --force
    positional.push(argv[i]);
  }

  if (argv.includes('--example')) { process.stdout.write(EXAMPLE_SPEC); return 0; }
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USO); return 0; }

  const [spec] = positional;
  if (!spec) { console.error(USO); return 2; }
  if (!existsSync(spec)) { console.error(`não achei a spec ${spec}`); return 2; }

  const blocks = buildBlocks(readFileSync(spec, 'utf8'), { tabLabel: flag('tab-label') });
  for (const w of blocks.warnings) console.error(`aviso:\n${w}`);

  const into = flag('into');
  if (!into) {
    // stdout: os quatro pedaços, cada um com o lugar onde ele mora.
    process.stdout.write(
`<!-- ═══ 1/3 · a ABA: o <li> vai no <ul class="nav nav-tabs" id="doc-tabs">, junto dos outros ═══ -->
${blocks.navLi}

<!-- ═══ 2/3 · o PAINEL: vai no <div class="tab-content" id="doc-tabs-content">, junto dos outros ═══ -->
${blocks.paneBlock}

<!-- ═══ 3/3 · o RUNTIME: a última coisa antes de </body>, DEPOIS do runtime do documento ═══ -->
${blocks.runtimeBlock}

<!-- ═══ e o que quase todo mundo esquece: as duas regras dentro do @media print do <style>.
         Sem elas o PDF sai com o prompt cortado nos 30rem do <pre>. ═══ -->
${blocks.cssBlock}
`);
    console.error(`construtor #${blocks.shellId} · ${blocks.prompt.split('\n').length} linhas de prompt padrão`);
    return 0;
  }

  if (!existsSync(into)) { console.error(`não achei o documento ${into}`); return 2; }
  const antes = readFileSync(into, 'utf8');
  const depois = injectInto(antes, blocks, { force: argv.includes('--force') });
  writeFileSync(into, depois);                              // só aqui, e só se nada falhou
  console.log(`${into} — aba "${blocks.label}" (#${blocks.paneId}) com o construtor #${blocks.shellId}`);
  console.log(`próximo: node ${resolve(HERE, 'check-doc.mjs')} ${into}`);
  return 0;
}

/**
 * "Fui executado direto, ou fui importado?" — a guarda existe porque new-doc.mjs importa
 * buildBlocks/injectInto daqui, e importar não pode disparar o CLI.
 *
 * ARMADILHA (não "simplifique" para resolve(argv[1]) === fileURLToPath(import.meta.url)):
 * o install.sh instala a skill como SYMLINK do diretório html-explainer/ inteiro
 * (~/.claude/skills/html-explainer -> repo/html-explainer). O loader ESM do Node resolve
 * symlinks antes de formar import.meta.url; resolve() só normaliza `.`/`..` e NÃO resolve
 * symlink. Pelo caminho do link os dois lados nunca batiam: main() não rodava e o script
 * saía 0, mudo — `--example > spec.xml` gerava um arquivo VAZIO sem nenhum aviso.
 * Por isso os dois lados passam por realpathSync.
 *
 * realpathSync pode falhar (arquivo apagado sob os pés, permissão negada num diretório do
 * caminho): nesse caso caímos no resolve() de antes, que é a comparação sem symlink — pior,
 * mas nunca pior do que era. E se argv[1] for um diretório (entrypoint via package main),
 * nenhuma das duas casa: aí o comportamento é o de módulo importado, que é o seguro.
 */
function executadoDiretamente() {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const aqui = fileURLToPath(import.meta.url);
  const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  return real(argv1) === real(aqui) || resolve(argv1) === aqui;
}

if (executadoDiretamente()) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    if (!(e instanceof PbError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}
