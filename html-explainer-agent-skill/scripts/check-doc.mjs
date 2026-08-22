#!/usr/bin/env node
/**
 * check-doc.mjs — linter dos HTML gerados pela skill html-explainer-agent-skill.
 *
 *   node check-doc.mjs documento.html [outro.html ...]
 *   node check-doc.mjs documento.html --quiet    # só erros, sem os avisos
 *
 * Sai com 1 se houver ERRO, 0 se só houver AVISO. Pega justamente o que passa
 * despercebido ao olhar a página: par ARIA quebrado, duas abas ativas, `<` não
 * escapado dentro de <code>, versão flutuante de CDN, arquivo externo ao lado.
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
