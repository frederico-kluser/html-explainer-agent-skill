#!/usr/bin/env node
/**
 * check-doc.mjs — linter dos HTML gerados pela skill html-explainer-agent-skill.
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

/*
 * `process.exitCode = …`, nunca `process.exit(…)` — o mesmo critério do `new-builder.mjs`,
 * do `new-doc.mjs` e do `escape-code.mjs`. Quando o stdout é um CANO (`| less`, CI, outro
 * processo com spawn+pipe) a escrita do Node é ASSÍNCRONA; `process.exit()` derruba o processo
 * e descarta o que ainda está na fila. Um relatório de vários arquivos passa fácil dos 64 KB
 * do buffer do cano, e o corte sairia com o código de saída CERTO — pior ainda de perceber.
 *
 * A guarda de uso é a única saída antecipada do arquivo, e não dá para trocá-la por `return`
 * porque isto é o topo do módulo. Ela vira uma bandeira: marca o código 2 aqui, e o veredito
 * do fim do arquivo (a única outra linha executável no topo) fica dentro do `else`. O contrato
 * continua o mesmo: 2 sem argumento, 1 com erro, 0 com só aviso.
 */
const semArquivos = !files.length;
if (semArquivos) {
  console.error('uso: node check-doc.mjs <arquivo.html> [...] [--quiet]');
  process.exitCode = 2;
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
    // Atributo repetido: vale o PRIMEIRO. Isso NÃO é imitação do navegador — repetir atributo
    // viola a WFC "Unique Att Spec" do XML 1.0, e o DOMParser não fica com nenhum: ele RECUSA
    // o documento inteiro («Attribute value redefined»). Aqui a escolha é outra de propósito:
    // este é um LINTER, e recusar o arquivo inteiro por causa de um atributo duplicado deixaria
    // de reportar todos os outros problemas — justamente o que a pessoa veio buscar. Ficar com
    // o primeiro mantém a análise andando; o duplicado vira ruído local, não um apagão.
    // (Mesma política, e mesma justificativa, do parseAttrs() em test/helpers/mini-xml.mjs.)
    if (map.has(name)) continue;
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
// O runtime une os fragmentos com JOINERS[q.join] || JOINERS.newline — só estes quatro nomes
// existem no mapa, e o que não estiver aqui vira newline sem avisar ninguém.
const JOIN_VALUES = ['newline', 'blank-line', 'comma', 'space'];

/** Todo <script>…</script> do HTML cru, com atributos em [1] e miolo em [2]. */
const SCRIPT_RE = () => new RegExp(`<script\\b${ATTRS_SRC}>([\\s\\S]*?)</script>`, 'gi');

/**
 * Faixas [start, end) do que, no texto de uma spec, NÃO é markup da spec: comentário XML e
 * seção CDATA. A varredura é linear e imita a do próprio XML — comentário e CDATA não se
 * aninham, e quem ABRE PRIMEIRO manda. É por isso que não dá para usar dois `replace` em
 * sequência, em nenhuma ordem: `<!-- ]]> -->` é um comentário inteiro (o `]]>` de dentro é
 * texto), e `<![CDATA[ <!-- ]]>` é um CDATA cujo `<!--` é texto. Cada ordem fixa erra um
 * dos dois casos; a varredura por quem-vem-antes acerta os dois, e é O(n).
 *
 * CDATA sem `]]>` não é seção nenhuma (o DOMParser recusaria a spec, e o `replace` anterior
 * também não casava): a varredura só pula o marcador e segue lendo como texto, que é o
 * comportamento que já existia. Comentário sem `-->` vira faixa até o fim, marcada com
 * `unclosed` para quem chamou poder dizer isso em voz alta em vez de engolir a spec calado.
 */
function inertRanges(body) {
  const out = [];
  let i = 0;
  for (;;) {
    const c = body.indexOf('<!--', i);
    const d = body.indexOf('<![CDATA[', i);
    if (c === -1 && d === -1) break;
    if (d === -1 || (c !== -1 && c < d)) {
      const end = body.indexOf('-->', c + 4);
      if (end === -1) { out.push({ start: c, end: body.length, kind: 'comment', unclosed: true }); break; }
      out.push({ start: c, end: end + 3, kind: 'comment' });
      i = end + 3;
    } else {
      const end = body.indexOf(']]>', d + 9);
      if (end === -1) { i = d + 9; continue; }
      out.push({ start: d, end: end + 3, kind: 'cdata' });
      i = end + 3;
    }
  }
  return out;
}

/** Troca cada faixa por espaços, mantendo o tamanho — o nº de linha continua certo. */
function blankRanges(body, ranges) {
  if (!ranges.length) return body;
  let out = '';
  let i = 0;
  for (const r of ranges) {
    out += body.slice(i, r.start) + ' '.repeat(r.end - r.start);
    i = r.end;
  }
  return out + body.slice(i);
}

function promptBuilder(html, masked, structMask, err, warn) {
  // A spec vive dentro de <script type="application/xml"> e mask() apaga o miolo de TODO
  // <script> — por isso ela é lida do HTML CRU. Não há risco de confundir com um documento
  // que *ensina* este markup: dentro de <pre> o "<" está escapado (&lt;script), e o que
  // não estiver já é reprovado por codeBlocks().
  const specs = [];
  for (const m of html.matchAll(SCRIPT_RE())) {
    if (!/<prompt-builder\b/i.test(m[2])) continue;
    const sa = attrsOf(m[1]);
    // O type é comparado sem os parâmetros de mídia: "application/xml; charset=utf-8" é o
    // mesmo tipo, e o navegador também o lê assim.
    const tipo = (sa.get('type') || '').toLowerCase().split(';')[0].trim();
    // Script sem type (ou com type de JS) o navegador EXECUTA. Nele, um "<prompt-builder>"
    // costuma ser só uma menção em string ou comentário — é o caso do próprio runtime do
    // construtor, que traz a frase «a raiz da spec precisa ser <prompt-builder>». Só conta
    // como spec (quebrada) o bloco executável que tem o elemento raiz INTEIRO, abertura e
    // fechamento: aí não é menção, é uma spec parada no lugar errado.
    const executavel = !tipo || tipo === 'module'
      || /^(?:text\/|application\/)?(?:javascript|ecmascript)/.test(tipo);
    if (executavel && !/<\/prompt-builder\s*>/i.test(m[2])) continue;

    // A checagem mais grave: sem type="application/xml" o bloco deixa de ser inerte e o
    // navegador tenta rodar XML como JavaScript. Ela vem ANTES de qualquer outra coisa
    // porque o documento sairia daqui com selo verde se o bloco fosse só descartado.
    if (tipo !== 'application/xml') {
      if (executavel)
        err(`a spec do construtor está num <script> ${tipo ? `type="${tipo}"` : 'sem type'} — o navegador executa `
          + 'o bloco como JavaScript, o XML estoura em SyntaxError no console e a aba do construtor abre vazia',
            m.index, 'o bloco só fica inerte com <script type="application/xml" id="pb-spec-XXX">');
      else
        err(`a spec do construtor está num <script type="${tipo}"> — o tipo do contrato é "application/xml", que é `
          + 'o que o gerador e o linter procuram para achar a spec; em qualquer outro tipo ela vira um bloco '
          + 'anônimo que ninguém mais reconhece', m.index,
            'troque para type="application/xml"');
    }

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

  // ── ganchos do §4, no runtime do documento ─────────────────────────────────
  // As duas linhas moram DENTRO de um <script>, e o mask() esvazia o miolo de todo <script>:
  // procurá-las no `masked` acharia sempre nada. Daí o HTML cru — mas só o corpo dos <script>,
  // e não o arquivo inteiro: um documento que EXIBE as duas linhas num bloco de código não
  // passa a tê-las por causa disso.
  let js = '';
  for (const m of html.matchAll(SCRIPT_RE())) js += m[2] + '\n';
  const ondeGancho = (shells[0] ?? specs[0]).index;

  if (!/\.closest\(\s*(['"])\[data-live\]\1\s*\)/.test(js))
    err('o runtime do documento não pula os blocos [data-live] ao guardar a fonte crua — o botãozinho de copiar '
      + 'do hover fica com o prompt do momento do load e nunca mais atualiza, por mais que o formulário mude',
        ondeGancho, "acrescente «if (code.closest('[data-live]')) return;» antes do sources.set(code, …)");

  // `=(?!=)`: o gancho é a ATRIBUIÇÃO. O próprio runtime do construtor traz um
  // `typeof global.__explainerCopy === 'function'` — leitura, não gancho —, e sem o
  // negative lookahead esse teste passaria por instalação do gancho.
  if (!/\b(?:window|globalThis|global)\s*\.\s*__explainerCopy\s*=(?!=)/.test(js))
    err('o runtime do documento não expõe window.__explainerCopy — o botão "Copiar prompt" do construtor não '
      + 'tem como reusar o caminho de cópia do documento e cai no fallback próprio, que é uma segunda '
      + 'implementação da mesma coisa para manter',
        ondeGancho, 'acrescente «window.__explainerCopy = copyText;» ao final da IIFE do runtime do template');

  // ── casca ↔ spec ───────────────────────────────────────────────────────────
  const byId = new Map();
  for (const s of specs) if (s.id) byId.set(s.id, s);

  // Duas cascas na mesma spec montam o MESMO modelo, e os ids gerados saem do id da spec:
  // saem iguais nas duas. Como o runtime lê e escreve tudo por getElementById, que devolve
  // o primeiro do documento, a segunda cópia vira decoração.
  const porSpec = new Map();

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
      const antes = porSpec.get(sh.spec);
      if (antes)
        err(`duas cascas com data-pb-spec="${sh.spec}" (a outra na linha ${lineOf(html, antes.index)}) — as duas `
          + 'montam o mesmo construtor, com os mesmos ids gerados; o runtime lê os controles por getElementById, '
          + 'que devolve sempre o primeiro do documento, então clicar na segunda não muda o prompt dela',
            sh.index, 'um construtor por spec: duplique a spec com outro id, ou apague a casca repetida');
      else porSpec.set(sh.spec, sh);
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
    // se não saírem da frente, um fragmento que cite <option> vira opção fantasma. O mesmo
    // vale para o COMENTÁRIO XML, e por um motivo mais cruel: comentar é justamente escrever
    // «escolha a <question> e a <option> certas», e sem apagá-lo essa frase vira uma pergunta
    // fantasma — sem id e sem type — que reprova um documento perfeito. O branco preserva o
    // tamanho, então o nº de linha continua certo.
    const inerts = inertRanges(s.body);
    const struct = blankRanges(s.body, inerts);

    // Só os comentários, com o CDATA INTACTO: é neste texto que os {{...}} são procurados,
    // porque eles moram dentro do CDATA do <template>. Assim um {{marcador}} comentado não
    // vira marcador fantasma, e nenhum {{marcador}} de verdade some.
    const tplText = blankRanges(s.body, inerts.filter((r) => r.kind === 'comment'));

    // Comentário sem `-->` engoliria o resto da spec em branco, e o documento sairia daqui
    // acusado de "spec sem <template>" — sintoma sem causa. O DOMParser também recusa a spec
    // inteira nesse caso, então é erro de verdade, e vale dizer qual é.
    const aberto = inerts.find((r) => r.unclosed);
    if (aberto)
      err('comentário XML aberto com <!-- e nunca fechado — daí até o fim da spec tudo vira comentário: '
        + 'o DOMParser recusa a spec inteira e a aba do construtor abre com o aviso vermelho',
          s.at + aberto.start, 'feche o comentário com -->');

    // ── elemento raiz ──
    // Contado no texto estrutural: um <prompt-builder> citado dentro de um CDATA (fragmento
    // que ensina o próprio formato) já saiu da frente e não conta como segunda raiz.
    const raizes = [...struct.matchAll(tagRe('prompt-builder'))];
    if (raizes.length > 1)
      err(`${raizes.length} elementos <prompt-builder> no mesmo <script> — XML só admite um elemento raiz, `
        + 'então o DOMParser recusa a spec INTEIRA e a aba abre com o aviso vermelho de spec inválida, '
        + 'sem nenhuma pergunta', s.at + raizes[1].index,
          'um <script> por construtor: separe as specs em dois blocos, cada um com seu id');

    if (raizes.length) {
      const rid = attrsOf(raizes[0][1]).get('id');
      const ondeRaiz = s.at + raizes[0].index;
      if (rid == null || rid === '')
        err('<prompt-builder> sem id — o runtime cai no prefixo genérico "pb": os ids gerados viram "pb-<pergunta>" '
          + 'e o estado salvo vai para localStorage["pb:pb"], então dois construtores assim no mesmo documento '
          + 'nascem com ids duplicados e disputam a mesma memória', ondeRaiz,
            '<prompt-builder id="plano" lang="xml" title="…">');
      else if (!/^[a-z][a-z0-9-]*$/.test(rid))
        err(`id de construtor inválido "${rid}" — ele é colado na frente de TODO id gerado `
          + '(<pb-id>-<pergunta>-<opção>), e com maiúscula, espaço ou acento esses ids deixam de ser '
          + 'endereçáveis por âncora #id e por seletor CSS', ondeRaiz,
            'use [a-z][a-z0-9-]*, como nos ids de pergunta');
    }

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

      // `join` é o separador dos fragmentos das opções marcadas — só existe em checkbox.
      if (qa.has('join')) {
        const j = qa.get('join');
        if (!JOIN_VALUES.includes(j))
          err(`pergunta ${nome} com ${j === null ? '`join` pelado' : `join="${j}"`} — o runtime só conhece `
            + 'newline, blank-line, comma e space; qualquer outro valor ele troca por newline sem avisar, '
            + 'e o prompt sai com os fragmentos unidos de um jeito que você não escreveu', at,
              'join="newline" (padrão) · "blank-line" · "comma" · "space"');
        else if (type !== 'checkbox' && QUESTION_TYPES.includes(type))
          warn(`join="${j}" na pergunta ${nome}, que é ${type} — join só serve para unir os fragmentos de várias `
             + 'opções marcadas, ou seja, só em checkbox; aqui o runtime lê o atributo e nunca o usa', at,
               'tire o join, ou troque a pergunta para type="checkbox"');
      }

      // O contrato proíbe <option> em text/textarea, e o runtime confirma: pbField monta a caixa
      // de digitação e nem olha para as opções, que ficam no XML sem chegar à tela.
      if (type === 'text' || type === 'textarea') {
        const [ta, tb] = bodyRange(struct, q, 'question');
        for (const o of struct.slice(ta, tb).matchAll(tagRe('option')))
          err(`<option> dentro da pergunta ${nome}, que é ${type} — o runtime monta uma caixa de digitação e `
            + 'ignora as opções: elas não aparecem na tela nem entram no prompt, e quem escreveu a spec '
            + 'acha que configurou alguma coisa', s.at + ta + o.index,
              'opção só existe em radio e checkbox; para sugerir um valor inicial use default="…" na pergunta');
      }

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
      for (const m of tplText.slice(a, b).matchAll(/\{\{([^{}]*)\}\}/g)) {
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

if (!semArquivos) {
  for (const file of files) check(file);
  process.exitCode = totalErrors > 0 ? 1 : 0;
}
