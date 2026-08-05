#!/usr/bin/env node
/**
 * check-doc.mjs — linter dos HTML gerados pela skill html-explainer.
 *
 *   node check-doc.mjs documento.html [outro.html ...]
 *   node check-doc.mjs documento.html --quiet    # só erros, sem os avisos
 *
 * Sai com 1 se houver ERRO, 0 se só houver AVISO. Pega justamente o que passa
 * despercebido ao olhar a página: par ARIA quebrado, duas abas ativas, `<` não
 * escapado dentro de <code>, versão flutuante de CDN, arquivo externo ao lado,
 * construtor de prompt cuja spec e cuja casca não se encontram.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const files = args.filter((a) => !a.startsWith('-'));

if (!files.length) {
  console.error('uso: node check-doc.mjs <arquivo.html> [...] [--quiet]');
  process.exit(2);
}

const C = process.stdout.isTTY
  ? { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' }
  : { red: '', yellow: '', green: '', dim: '', off: '' };

let totalErrors = 0;

// ─────────────────────────────────────────────────────────────────────────────

function check(file) {
  let html;
  try {
    html = readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`${C.red}não consegui ler ${file}: ${e.message}${C.off}`);
    totalErrors++;
    return;
  }

  const problems = [];
  const err = (msg, idx, hint) => problems.push({ level: 'erro', msg, line: lineOf(html, idx), hint });
  const warn = (msg, idx, hint) => problems.push({ level: 'aviso', msg, line: lineOf(html, idx), hint });

  // Comentários, <style> e <script> inline viram espaço: o conteúdo deles não é
  // markup do documento e produziria falso positivo em quase toda checagem.
  // Os offsets são preservados para o número de linha continuar certo.
  const masked = mask(html);
  // Para as checagens ESTRUTURAIS, os blocos de código também saem: um documento que
  // *ensina* markup de aba tem `role="tablist"` e `id="tab-a"` dentro de <pre>, e sem
  // isso o linter contaria as abas do exemplo como se fossem abas de verdade.
  const structMask = maskCode(masked);

  structure(html, structMask, err, warn);
  tabs(structMask, err, warn);
  codeBlocks(masked, err, warn);
  externals(html, err, warn);
  leftovers(structMask, warn);
  // html cru para a spec (mask() apaga o miolo do <script>), structMask para a casca.
  promptBuilder(html, masked, structMask, err, warn);

  report(file, problems);
}

/** Substitui o miolo de comentários/style/script por espaços, mantendo o tamanho. */
function mask(html) {
  const blank = (m) => ' '.repeat(m.length);
  return html
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, a, b, c) => a + blank(b) + c)
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, a, b, c) => a + blank(b) + c);
}

/**
 * Blank no miolo de <pre>…</pre> e de <code>…</code> inline, mantendo o tamanho.
 * O <code> inline entra junto porque prosa técnica cita markup: uma frase com
 * `<code>role="tablist"</code>` não é um tablist.
 */
function maskCode(html) {
  const blank = (_, a, b, c) => a + ' '.repeat(b.length) + c;
  return html
    .replace(/(<pre\b[^>]*>)([\s\S]*?)(<\/pre>)/gi, blank)
    .replace(/(<code\b[^>]*>)([\s\S]*?)(<\/code>)/gi, blank);
}

function lineOf(html, idx) {
  if (idx == null || idx < 0) return null;
  return html.slice(0, idx).split('\n').length;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[2] ?? m[3]) : null;
}

// ── leitura de tag: um parser só, usado por todo o construtor ────────────────

/**
 * Miolo de uma tag de abertura. XML 1.0 só proíbe `<` e `&` crus em valor de atributo —
 * `>` é legal, e o DOMParser do runtime aceita. Com `[^>]*` a tag seria cortada no meio
 * de um label como «custo > 0» e a pergunta apareceria "sem label". As três alternativas
 * começam em caracteres disjuntos (`"`, `'`, resto), então não há ambiguidade: cada
 * caractere só pode ser consumido de um jeito e não existe backtracking a explorar.
 */
const ATTRS_SRC = '((?:"[^"]*"|\'[^\']*\'|[^>"\'])*)';

/** Tag de abertura de `name` (ou de qualquer nome, com `[a-z][\w-]*`), lendo `>` em valor. */
function tagRe(name, flags = 'gi') {
  return new RegExp(`<${name}\\b${ATTRS_SRC}>`, flags);
}

const ANY_TAG = () => tagRe('[a-z][\\w-]*');

/**
 * Mapa nome→valor dos atributos capturados por `ATTRS_SRC`. Nome em minúsculas (o
 * DOMParser trata `CLASS` e `class` igual); aspas simples e duplas valem o mesmo; valor
 * sem aspas também; atributo pelado entra com valor `null`.
 *
 * Existir este mapa é o que impede que a *palavra* de um atributo dentro de um VALOR conte
 * como atributo: `label="… (não é o default)"` é lido como um par label→texto, e o `default`
 * de dentro do texto nunca chega ao mapa.
 */
function attrsOf(attrs) {
  const map = new Map();
  const re = /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrs))) {
    const name = m[1].toLowerCase();
    if (map.has(name)) continue; // o DOMParser fica com o primeiro
    map.set(name, m[2] ?? m[3] ?? m[4] ?? null);
  }
  return map;
}

// ── documento ────────────────────────────────────────────────────────────────

function structure(html, masked, err, warn) {
  const htmlTag = masked.match(/<html\b[^>]*>/i);
  if (!htmlTag) {
    err('falta a tag <html>', 0);
  } else {
    if (attr(htmlTag[0], 'data-bs-theme') !== 'dark')
      err('<html> sem data-bs-theme="dark" — o documento vai abrir no tema claro', htmlTag.index,
          'troque para <html lang="pt-BR" data-bs-theme="dark">');
    if (!attr(htmlTag[0], 'lang'))
      warn('<html> sem lang — leitor de tela lê com a pronúncia errada', htmlTag.index);
  }

  if (!/<meta\s+name=["']color-scheme["']\s+content=["']dark["']/i.test(masked))
    warn('sem <meta name="color-scheme" content="dark"> — pisca branco antes do CSS carregar e os '
       + 'controles nativos saem claros', masked.search(/<head\b/i));

  if (!/<meta\s+charset=/i.test(masked))
    err('sem <meta charset="utf-8"> — acento vira caractere quebrado em file://', masked.search(/<head\b/i));

  if (!/<meta\s+name=["']viewport["']/i.test(masked))
    warn('sem <meta name="viewport"> — ilegível no celular', masked.search(/<head\b/i));

  const title = masked.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!title || !title[1].trim()) err('sem <title>', masked.search(/<head\b/i));

  const h1 = masked.match(/<h1\b/gi) || [];
  if (h1.length === 0) warn('sem <h1> — o documento não tem título visível', 0);
  if (h1.length > 1) warn(`${h1.length} elementos <h1> — use um só e desça para <h2>`, masked.search(/<h1\b/i));

  // ids duplicados: quebram aba, âncora e aria de um jeito silencioso
  const seen = new Map();
  for (const m of masked.matchAll(/\bid\s*=\s*"([^"]+)"/g)) {
    if (seen.has(m[1])) err(`id duplicado "${m[1]}" (também na linha ${lineOf(html, seen.get(m[1]))})`, m.index);
    else seen.set(m[1], m.index);
  }
}

// ── abas ─────────────────────────────────────────────────────────────────────

function tabs(masked, err, warn) {
  const triggers = [...masked.matchAll(/<(button|a)\b[^>]*data-bs-toggle\s*=\s*"(tab|pill)"[^>]*>/gi)];
  if (!triggers.length) return; // documento sem abas é válido

  if (!/<script\b[^>]*src="[^"]*bootstrap[^"]*\.js/i.test(masked))
    err('há abas mas nenhum <script> do Bootstrap — elas não vão trocar', triggers[0].index,
        'inclua bootstrap.bundle.min.js antes do </body>');

  const panes = new Map();
  for (const m of masked.matchAll(/<div\b[^>]*class\s*=\s*"[^"]*\btab-pane\b[^"]*"[^>]*>/gi)) {
    const id = attr(m[0], 'id');
    if (id) panes.set(id, { tag: m[0], index: m.index });
  }

  let activeTriggers = 0;

  for (const t of triggers) {
    const tag = t[0];
    const tid = attr(tag, 'id');
    const target = attr(tag, 'data-bs-target') || attr(tag, 'href');
    const controls = attr(tag, 'aria-controls');
    const role = attr(tag, 'role');
    const isActive = /\bclass\s*=\s*"[^"]*\bactive\b/.test(tag);
    if (isActive) activeTriggers++;

    if (role !== 'tab') err('gatilho de aba sem role="tab"', t.index);
    if (!tid) err('gatilho de aba sem id — o painel não tem como apontar de volta', t.index);
    if (t[1].toLowerCase() === 'button' && !/\btype\s*=\s*"button"/i.test(tag))
      warn('<button> de aba sem type="button" — dentro de <form> ele submete a página', t.index);

    if (!target || !target.startsWith('#')) {
      err('gatilho de aba sem data-bs-target="#id-do-painel"', t.index);
      continue;
    }
    const pid = target.slice(1);
    const pane = panes.get(pid);
    if (!pane) {
      err(`data-bs-target="${target}" não corresponde a nenhum .tab-pane`, t.index);
      continue;
    }
    if (controls !== pid)
      err(`aria-controls="${controls ?? ''}" deveria ser "${pid}" (sem #)`, t.index);
    if (attr(pane.tag, 'aria-labelledby') !== tid)
      err(`o painel #${pid} tem aria-labelledby="${attr(pane.tag, 'aria-labelledby') ?? ''}", esperado "${tid}"`,
          pane.index);
    if (attr(pane.tag, 'role') !== 'tabpanel')
      err(`o painel #${pid} não tem role="tabpanel"`, pane.index);
    if (attr(pane.tag, 'tabindex') == null)
      warn(`o painel #${pid} sem tabindex="0" — quem usa teclado não consegue rolar o conteúdo`, pane.index);

    const expected = isActive ? 'true' : 'false';
    if (attr(tag, 'aria-selected') !== expected)
      err(`aria-selected deveria ser "${expected}" neste gatilho`, t.index);

    const paneActive = /\bclass\s*=\s*"[^"]*\bactive\b/.test(pane.tag);
    if (isActive !== paneActive)
      err(`gatilho e painel #${pid} discordam sobre quem está ativo`, pane.index);
    if (paneActive && !/\bclass\s*=\s*"[^"]*\bshow\b/.test(pane.tag))
      err(`o painel ativo #${pid} tem .active mas não .show — abre invisível (opacity 0)`, pane.index,
          'a classe é "tab-pane fade show active"');
  }

  const lists = (masked.match(/role\s*=\s*"tablist"/gi) || []).length;
  if (!lists) err('nenhum role="tablist" — o container das abas precisa dele', triggers[0].index);

  if (activeTriggers !== lists)
    err(`${activeTriggers} gatilho(s) com .active para ${lists} tablist(s) — deve haver exatamente um por grupo`,
        triggers[0].index);

  for (const [pid, pane] of panes) {
    const found = triggers.some((t) => (attr(t[0], 'data-bs-target') || attr(t[0], 'href')) === '#' + pid);
    if (!found) warn(`o painel #${pid} não tem aba que o abra — conteúdo inalcançável`, pane.index);
  }
}

// ── blocos de código ─────────────────────────────────────────────────────────

function codeBlocks(masked, err, warn) {
  const blocks = [...masked.matchAll(/<pre\b[^>]*>\s*<code\b([^>]*)>([\s\S]*?)<\/code>/gi)];

  for (const b of blocks) {
    const attrs = b[1];
    const body = b[2];
    const cls = (attr('<x ' + attrs + '>', 'class') || '');

    if (!/\blanguage-[\w+#-]+/.test(cls) && !/\bnohighlight\b|\bplaintext\b/.test(cls))
      err('bloco de código sem class="language-XXX" — o highlight.js chuta a linguagem', b.index,
          'ex.: <code class="language-ts">, ou "nohighlight" se for saída de terminal');

    // `<` literal aqui significa markup não escapado: o navegador interpreta como tag,
    // o highlight.js reclama no console e o texto sai truncado. A exceção é o bloco que
    // pinta a própria saída (prompt de terminal): ele declara data-allow-html e assume.
    const bare = /\bdata-allow-html\b/.test(attrs) ? -1 : body.indexOf('<');
    if (bare !== -1)
      err('HTML não escapado dentro de <code> — escape & < > como &amp; &lt; &gt;',
          b.index + b[0].indexOf(body) + bare,
          'use scripts/escape-code.mjs');

    if (!body.trim()) warn('bloco de código vazio', b.index);
  }

  // <code> solto com markup dentro é o mesmo erro, versão inline
  for (const m of masked.matchAll(/<code\b(?![^>]*language-)[^>]*>([^<]*)<\/code>/gi)) {
    if (/&(?!amp;|lt;|gt;|quot;|#\d+;|[a-z]+;)/.test(m[1]))
      warn('`&` solto dentro de <code> — escape como &amp;', m.index);
  }
}

// ── recursos externos ────────────────────────────────────────────────────────

const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'esm.sh', 'fonts.googleapis.com', 'fonts.gstatic.com'];

/** Extrai a versão da URL. cdnjs põe no caminho; jsDelivr/unpkg/esm.sh põem depois do @. */
function versionOf(url) {
  const cdnjs = url.match(/\/ajax\/libs\/[^/]+\/(\d[^/]*)\//);
  if (cdnjs) return cdnjs[1];
  const npm = url.match(/@(\d[\w.+-]*)/);
  return npm ? npm[1] : null;
}

function externals(html, err, warn) {
  const tags = [
    ...html.matchAll(/<link\b[^>]*\brel\s*=\s*"stylesheet"[^>]*>/gi),
    ...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*"[^"]*"[^>]*>/gi),
  ];

  for (const t of tags) {
    const tag = t[0];
    const url = attr(tag, 'href') || attr(tag, 'src') || '';
    if (!url) continue;

    if (/^https?:\/\//i.test(url)) {
      if (url.startsWith('http://'))
        err(`recurso por http:// (${url}) — bloqueado como conteúdo misto`, t.index, 'troque para https://');

      const host = url.replace(/^https?:\/\//, '').split('/')[0];
      if (!CDN_HOSTS.includes(host))
        warn(`recurso fora dos CDNs conhecidos: ${host}`, t.index);

      const version = versionOf(url);
      if (/@latest\b|@\^|@~|@next\b/.test(url))
        err(`versão flutuante em ${url} — trave a versão exata`, t.index,
            'ex.: bootstrap@5.3.8, nunca bootstrap@latest');
      else if (!version)
        err(`URL de CDN sem versão: ${url} — amanhã ela aponta para outro código`, t.index,
            'ex.: /npm/bootstrap@5.3.8/dist/...');
      else if (version.split('.').length < 3)
        warn(`versão parcial "@${version}" em ${url} — com SRI ela quebra no próximo patch`, t.index);

      if (!attr(tag, 'integrity'))
        warn(`sem integrity (SRI) em ${url}`, t.index, 'gere com: openssl dgst -sha384 -binary f | openssl base64 -A');
      else if (!attr(tag, 'crossorigin'))
        err(`integrity sem crossorigin="anonymous" em ${url} — o recurso é bloqueado`, t.index);
    } else if (!url.startsWith('data:')) {
      err(`arquivo externo local "${url}" — o documento deixa de ser um arquivo único`, t.index,
          'inline o conteúdo, ou use CDN, ou data: URI');
    }
  }

  for (const m of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi)) {
    const u = m[1];
    if (!/^(data:|https:)/i.test(u))
      err(`<img src="${u}"> aponta para arquivo ao lado — use data: URI ou SVG inline`, m.index);
  }
}

// ── sobras do template ───────────────────────────────────────────────────────

function leftovers(masked, warn) {
  for (const m of masked.matchAll(/«[^»]*»/g)) warn(`placeholder do template não preenchido: ${m[0]}`, m.index);
  for (const m of masked.matchAll(/\b(TODO|FIXME|XXX|Lorem ipsum)\b/g)) warn(`sobrou "${m[1]}" no documento`, m.index);
}

// ── construtor de prompt ─────────────────────────────────────────────────────

/**
 * Fim do elemento aberto em `start` (índice do "<"), contando o aninhamento do MESMO
 * nome. Corre sobre o texto já mascarado: um <div> que só existe dentro de um <pre>
 * de exemplo já virou espaço e não desequilibra a conta.
 */
function endOfElement(s, start, name) {
  const re = new RegExp(`<(/?)${name}\\b${ATTRS_SRC}>`, 'gi');
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) {
      if (--depth === 0) return m.index + m[0].length;
    } else if (!/\/>$/.test(m[0])) {
      depth++;
    }
  }
  return s.length; // sem fechamento: o resto do arquivo é o corpo
}

/** [início, fim) do corpo do elemento aberto em `open`, em coordenadas de `struct`. */
function bodyRange(struct, open, name) {
  const start = open.index + open[0].length;
  if (/\/>$/.test(open[0])) return [start, start]; // <question ... /> não tem corpo
  const close = struct.toLowerCase().indexOf(`</${name}`, start);
  return [start, close === -1 ? struct.length : close];
}

/**
 * Todas as tags de abertura dentro de `s` que declaram o atributo `name` (inclusive pelado,
 * como data-pb-form e data-live). Procurar o nome solto no texto acharia a PROSA: uma aba
 * que explica o contrato diz "o runtime injeta em data-pb-form" e isso não é markup — o
 * documento passaria sem ter o gancho, ou levaria erro por ter escrito sobre ele.
 */
function tagsWithAttr(s, name) {
  const out = [];
  for (const t of s.matchAll(ANY_TAG())) if (attrsOf(t[1]).has(name)) out.push(t);
  return out;
}

/** Existe ao menos uma tag com esse atributo? */
function hasAttrTag(s, name) {
  return tagsWithAttr(s, name).length > 0;
}

/**
 * Faixas [index, end) de cada <pre>…</pre>, com a marca de `data-live`. Varrido à mão:
 * o regex equivalente (`<pre…>[\s\S]*?</pre>`) tenta o corpo a partir de CADA `<pre` e
 * fica quadrático num documento com muitos `<pre` sem fechar. A ordem é a mesma do regex
 * — depois de um par, a busca recomeça depois do fechamento.
 */
function preRanges(s) {
  const low = s.toLowerCase();
  const re = tagRe('pre');
  const out = [];
  let m;
  while ((m = re.exec(s))) {
    const close = low.indexOf('</pre>', re.lastIndex);
    if (close === -1) break; // sem fechamento não há corpo, e nenhum <pre> adiante fecha
    out.push({ index: m.index, end: close + 6, live: attrsOf(m[1]).has('data-live') });
    re.lastIndex = close + 6;
  }
  return out;
}

const QUESTION_TYPES = ['radio', 'checkbox', 'text', 'textarea'];

function promptBuilder(html, masked, structMask, err, warn) {
  // A spec vive dentro de <script type="application/xml"> e mask() apaga o miolo de TODO
  // <script> — por isso ela é lida do HTML CRU. Não há risco de confundir com um documento
  // que *ensina* este markup: dentro de <pre> o "<" está escapado (&lt;script), e o que
  // não estiver já é reprovado por codeBlocks().
  const specs = [];
  for (const m of html.matchAll(new RegExp(`<script\\b${ATTRS_SRC}>([\\s\\S]*?)</script>`, 'gi'))) {
    if (!/<prompt-builder\b/i.test(m[2])) continue;
    // Só bloco INERTE é spec. Script sem type (ou com type de JS) o navegador EXECUTA:
    // ali um "<prompt-builder>" é comentário do runtime, não a spec do documento — e sem
    // este filtro o próprio runtime seria lido como uma spec quebrada.
    const sa = attrsOf(m[1]);
    const tipo = (sa.get('type') || '').toLowerCase();
    if (!tipo || tipo === "module" || /^(?:text\/|application\/)?(?:javascript|ecmascript)/.test(tipo)) continue;
    specs.push({
      id: sa.get('id') ?? null,
      index: m.index,
      body: m[2],
      at: m.index + 8 + m[1].length, // offset do miolo no arquivo: "<script" + attrs + ">"
      used: false,
    });
  }

  // A casca, ao contrário, é markup de verdade da página: vem do structMask, que já
  // esvaziou <pre>/<code>. Um documento que exibe esta casca num bloco de código não
  // ganha um construtor por causa disso.
  const shells = [];
  for (const m of structMask.matchAll(tagRe('([a-z][\\w-]*)'))) {
    if (!m[2].includes('prompt-builder')) continue; // peneira barata antes de parsear
    const a = attrsOf(m[2]);
    // Classe casada como TOKEN da lista, que é o que o `.prompt-builder` do querySelectorAll
    // faz. Como substring, `class="prompt-builder-legend"` — um auxiliar decorativo — viraria
    // uma casca inteira e colheria os erros de um construtor que ele nem é.
    const cls = a.get('class');
    if (!cls || !cls.split(/\s+/).includes('prompt-builder')) continue;
    shells.push({
      tag: m[0],
      index: m.index,
      end: endOfElement(structMask, m.index, m[1]),
      id: a.get('id') ?? null,
      spec: a.get('data-pb-spec') ?? null,
    });
  }

  if (!specs.length && !shells.length) return; // documento sem construtor é válido

  // ── casca ↔ spec ───────────────────────────────────────────────────────────
  const byId = new Map();
  for (const s of specs) if (s.id) byId.set(s.id, s);

  for (const sh of shells) {
    const who = sh.id ? ` #${sh.id}` : '';
    if (!sh.spec) {
      err(`casca do construtor${who} sem data-pb-spec — o runtime não acha a spec e a aba abre vazia`,
          sh.index, 'data-pb-spec="<id do <script> que traz a spec>"');
    } else if (!byId.has(sh.spec)) {
      err(`data-pb-spec="${sh.spec}" não aponta para nenhuma spec — o construtor abre sem perguntas`,
          sh.index);
    } else {
      byId.get(sh.spec).used = true;
    }

    // O miolo da casca é lido do `masked` e não do `structMask`: a saída mora dentro de
    // um <pre>, que o structMask esvazia — inclusive o <code data-pb-output> lá dentro.
    const inner = masked.slice(sh.index, sh.end);

    if (!hasAttrTag(inner, 'data-pb-form'))
      err(`casca do construtor${who} sem [data-pb-form] — o runtime não tem onde injetar as perguntas e a aba abre vazia`,
          sh.index);
    if (!hasAttrTag(inner, 'data-pb-copy'))
      err(`casca do construtor${who} sem [data-pb-copy] — o prompt fica na tela sem jeito de levar para o chat`,
          sh.index);

    const outs = tagsWithAttr(inner, 'data-pb-output');
    if (!outs.length) {
      err(`casca do construtor${who} sem [data-pb-output] — o prompt montado não tem onde aparecer`,
          sh.index);
    } else {
      const pres = preRanges(inner);
      for (const o of outs) {
        const live = pres.some((p) => o.index > p.index && o.index < p.end && p.live);
        if (!live)
          err('[data-pb-output] fora de um <pre data-live> — o botãozinho de copiar do hover guarda o prompt inicial e nunca mais atualiza',
              sh.index + o.index,
              'a casca é <pre data-live><code class="language-xml" data-pb-output>');
      }
    }

    if (!hasAttrTag(inner, 'data-pb-reset'))
      warn(`casca do construtor${who} sem [data-pb-reset] — quem mexeu demais não tem como voltar ao padrão`,
           sh.index);

    const status = tagsWithAttr(inner, 'data-pb-status')[0];
    if (!status)
      warn(`casca do construtor${who} sem [data-pb-status][aria-live] — leitor de tela não fica sabendo que o prompt mudou`,
           sh.index);
    else if (!attrsOf(status[1]).has('aria-live'))
      warn('[data-pb-status] sem aria-live="polite" — o status muda calado para quem usa leitor de tela',
           sh.index + status.index);

    if (!/<noscript\b/i.test(inner))
      warn(`casca do construtor${who} sem <noscript> — com JS desligado a aba fica em branco, sem dizer por quê`,
           sh.index, 'o <noscript> vai dentro do [data-pb-form]');
  }

  for (const s of specs) {
    if (s.used) continue;
    if (!s.id)
      err('spec do construtor sem id no <script> — nenhuma casca consegue apontar para ela',
          s.index, '<script type="application/xml" id="pb-spec-XXX">');
    else
      err(`a spec #${s.id} não é referenciada por nenhuma casca — o XML fica no arquivo e ninguém monta nada`,
          s.index, `falta um .prompt-builder com data-pb-spec="${s.id}"`);
  }

  // ── miolo da spec ──────────────────────────────────────────────────────────
  for (const s of specs) {
    // Fragmento de <option> e esqueleto do <template> são XML arbitrário dentro de CDATA:
    // se não saírem da frente, um fragmento que cite <option> vira opção fantasma. O
    // branco preserva o tamanho, então o nº de linha continua certo.
    const struct = s.body.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (m) => ' '.repeat(m.length));

    // <template>: a posição vem do texto estrutural, o conteúdo vem do CRU — os {{...}}
    // moram justamente dentro do CDATA que acabou de ser apagado.
    const tpls = [...struct.matchAll(tagRe('template'))];
    if (!tpls.length)
      err('spec do construtor sem <template> — não há esqueleto onde encaixar as respostas',
          s.index, 'o esqueleto vai em <template><![CDATA[ ... ]]></template>');
    else if (tpls.length > 1)
      err(`${tpls.length} elementos <template> na mesma spec — o runtime monta com um só e o resto vira XML morto`,
          s.at + tpls[1].index);

    // ── perguntas ──
    const questions = [];
    const seen = new Map();
    for (const q of struct.matchAll(tagRe('question'))) {
      const qa = attrsOf(q[1]);
      const at = s.at + q.index;
      const id = qa.get('id') ?? null;
      const type = (qa.get('type') || '').toLowerCase();
      questions.push({ id, at });

      if (!id)
        err('<question> sem id — sem ele não há como chamá-la de {{...}} no template', at);
      else if (!/^[a-z][a-z0-9-]*$/.test(id))
        err(`id de pergunta inválido "${id}" — use [a-z][a-z0-9-]*, que é o que {{...}} e os ids gerados aceitam`, at);
      else if (seen.has(id))
        err(`id de pergunta duplicado "${id}" (também na linha ${lineOf(html, seen.get(id))}) — {{${id}}} fica ambíguo e uma das perguntas some do prompt`, at);
      else seen.set(id, at);

      const nome = id ? `"${id}"` : 'sem id';
      if (!QUESTION_TYPES.includes(type))
        err(`pergunta ${nome} com type="${qa.get('type') ?? ''}" — só existem radio, checkbox, text e textarea`, at);

      if (type !== 'radio' && type !== 'checkbox') continue;

      const [a, b] = bodyRange(struct, q, 'question');
      const opts = [...struct.slice(a, b).matchAll(tagRe('option'))];
      if (!opts.length) {
        err(`${type} ${nome} sem <option> — a pergunta aparece na tela sem nada para escolher`, at);
        continue;
      }

      let defaults = 0;
      for (const o of opts) {
        const oa = attrsOf(o[1]);
        const onde = s.at + a + o.index;
        // O runtime marca a opção com `o.getAttribute('default') === 'true'`: comparação com a
        // STRING "true", sem conversão. `default` pelado, `default="1"`, `default="yes"` — tudo
        // isso o runtime lê como não-marcado, e o formulário abre na opção errada calado.
        if (oa.has('default')) {
          const v = oa.get('default');
          if (v === 'true') defaults++;
          else if (v !== 'false')
            err(`<option> da pergunta ${nome} com ${v === null ? '`default` pelado' : `default="${v}"`}`
              + ' — o runtime só marca a opção quando o atributo é exatamente a string "true";'
              + ' qualquer outro valor ele ignora e a opção abre desmarcada', onde,
                'escreva default="true", ou tire o atributo');
        }
        if (oa.get('value') == null)
          err(`<option> da pergunta ${nome} sem value — a opção não tem como ser identificada nem salva`, onde);
        if (oa.get('label') == null)
          err(`<option> da pergunta ${nome} sem label — a opção aparece sem rótulo clicável`, onde);
      }

      // O runtime resolve o padrão do radio com `options.filter(checked)[0] || options[0]`:
      // sem nenhum default ele NÃO abre vazio — abre na primeira opção do XML. O prompt sai
      // inteiro; o que falta é a escolha do autor, que a ordem do arquivo tomou por ele.
      if (type === 'radio' && defaults === 0)
        err(`radio ${nome} sem nenhuma opção default="true" — o runtime cai na primeira opção da lista, `
          + 'então o padrão do documento é a ordem em que o XML ficou, não uma escolha sua', at,
            'marque a opção que deve vir escolhida com default="true"');
      // …e com vários, ele fica com o PRIMEIRO checked e ignora os outros, em silêncio.
      if (type === 'radio' && defaults > 1)
        err(`radio ${nome} com ${defaults} opções default="true" — o runtime fica com a primeira e ignora as demais, `
          + 'e quem lê a spec não tem como saber qual delas é o padrão de verdade', at);
    }

    if (questions.length > 12)
      warn(`${questions.length} perguntas num construtor só — acima de 12 ninguém chega ao fim do formulário`,
           questions[12].at, 'quebre em dois construtores, ou corte o que quase nunca muda');

    // ── {{marcadores}} ↔ perguntas ──
    const ids = new Set(questions.map((q) => q.id).filter(Boolean));
    const usados = new Set();
    for (const t of tpls) {
      const [a, b] = bodyRange(struct, t, 'template');
      for (const m of s.body.slice(a, b).matchAll(/\{\{([^{}]*)\}\}/g)) {
        const nome = m[1].trim();
        usados.add(nome);
        if (!ids.has(nome))
          err(`{{${m[1]}}} no <template> não casa com nenhuma pergunta — o marcador sai literal no prompt`,
              s.at + a + m.index);
      }
    }
    for (const q of questions) {
      if (q.id && ids.has(q.id) && !usados.has(q.id))
        warn(`a pergunta "${q.id}" não aparece no <template> — quem responde escolhe e a escolha não vai para o prompt`,
             q.at);
    }
  }
}

// ── saída ────────────────────────────────────────────────────────────────────

function report(file, problems) {
  const errors = problems.filter((p) => p.level === 'erro');
  const warns = problems.filter((p) => p.level === 'aviso');
  totalErrors += errors.length;

  const name = basename(file);
  if (!problems.length) {
    console.log(`${C.green}✓${C.off} ${name} — sem problemas`);
    return;
  }

  console.log(`\n${name}`);
  const show = quiet ? errors : [...errors, ...warns].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  for (const p of show) {
    const color = p.level === 'erro' ? C.red : C.yellow;
    const where = p.line ? `${file}:${p.line}` : file;
    console.log(`  ${color}${p.level}${C.off}  ${where}  ${p.msg}`);
    if (p.hint) console.log(`         ${C.dim}↳ ${p.hint}${C.off}`);
  }
  console.log(`  ${errors.length} erro(s), ${warns.length} aviso(s)`);
}

for (const file of files) check(file);
process.exit(totalErrors > 0 ? 1 : 0);
