#!/usr/bin/env node
/**
 * new-doc.mjs — cria um documento novo a partir do template da skill.
 *
 *   node new-doc.mjs "Como o cache do build funciona" ./cache.html
 *   node new-doc.mjs "Migração para v3" ./mig.html --tabs "Resumo,Como era,Como fica,Migrar"
 *   node new-doc.mjs "API de pagamentos" ./api.html --lang en --sub "v2.4 · jul/2026"
 *   node new-doc.mjs "Plano da migração" ./plano.html --builder
 *   node new-doc.mjs "Revisão do parser" ./rev.html --builder --spec ./spec.xml
 *
 * O que sai é o template com título, subtítulo e abas já montados — inclusive os
 * pares id/aria-controls/aria-labelledby, que é onde o erro costuma nascer.
 * O conteúdo de cada aba continua sendo seu trabalho.
 *
 * --builder acrescenta uma aba com o construtor de prompt já FUNCIONANDO. Sem --spec ele
 * usa a spec de planejamento padrão (a mesma de assets/prompt-builder.html): exigir um XML
 * escrito do zero devolveria exatamente o atrito que a feature existe para remover.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildBlocks, injectInto, defaultSpecXml, PbError } from './new-builder.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(HERE, '..', 'assets', 'template.html');

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const TAKES_VALUE = ['--tabs', '--sub', '--lang', '--spec', '--tab-label'];
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (TAKES_VALUE.includes(argv[i])) { i++; continue; } // pula a flag e o valor dela
  if (argv[i].startsWith('--')) continue;               // flag booleana: --force
  positional.push(argv[i]);
}

const [title, out] = positional;
if (!title || !out) {
  console.error('uso: node new-doc.mjs "<título>" <saida.html> [--tabs "A,B,C"] [--sub "..."] [--lang pt-BR] [--force]');
  console.error('     [--builder [--spec spec.xml] [--tab-label "Construtor"]]  acrescenta a aba do construtor de prompt');
  process.exit(2);
}

if (existsSync(out) && !argv.includes('--force')) {
  console.error(`${out} já existe — use --force para sobrescrever`);
  process.exit(2);
}

const tabs = (flag('tabs') || 'Visão geral,Como fazer,Armadilhas').split(',').map((s) => s.trim()).filter(Boolean);
if (tabs.length < 2) { console.error('precisa de pelo menos 2 abas'); process.exit(2); }

const sub = flag('sub') || '';
const lang = flag('lang') || 'pt-BR';

/** "Como era ANTES" → "como-era-antes". Sem acento, porque vira id e vai no #hash da URL. */
const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                     .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'aba';

const ids = [];
for (const t of tabs) {
  let base = slug(t), id = base, n = 2;
  while (ids.includes(id)) id = `${base}-${n++}`; // duas abas "Exemplo" não podem colidir
  ids.push(id);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const navHtml = tabs.map((label, i) => {
  const id = ids[i], first = i === 0;
  return `    <li class="nav-item" role="presentation">
      <button class="nav-link${first ? ' active' : ''}" id="tab-${id}" data-bs-toggle="tab" data-bs-target="#pane-${id}"
              type="button" role="tab" aria-controls="pane-${id}" aria-selected="${first}">
        ${esc(label)}
      </button>
    </li>`;
}).join('\n');

const panesHtml = tabs.map((label, i) => {
  const id = ids[i], first = i === 0;
  return `    <div class="tab-pane fade${first ? ' show active' : ''}" id="pane-${id}" role="tabpanel"
         aria-labelledby="tab-${id}" tabindex="0" data-print-title="${esc(label)}">
      <h2 class="h4">${esc(label)}</h2>
      <p>«conteúdo»</p>
    </div>`;
}).join('\n\n');

let html = readFileSync(TEMPLATE, 'utf8');

html = html
  .replace(/<html lang="pt-BR"/, `<html lang="${lang}"`)
  .replace(/«Título do documento»/g, esc(title))
  .replace(/«Título curto»/g, esc(title.length > 40 ? title.slice(0, 38) + '…' : title))
  .replace(/«subtítulo \/ versão \/ data»/g, esc(sub))
  .replace(/«O ponto que este documento explica»/g, esc(title));

// Troca o bloco inteiro de abas + painéis pelos gerados. O delimitador é a marca
// estrutural do template; se ela mudar lá, este replace falha alto em vez de silencioso.
const navRe = /(<ul class="nav nav-tabs" id="doc-tabs" role="tablist">\n)[\s\S]*?(\n  <\/ul>)/;
const paneRe = /(<div class="tab-content border border-top-0 rounded-bottom p-4" id="doc-tabs-content">\n)[\s\S]*?(\n  <\/div>\n\n  <footer)/;

if (!navRe.test(html) || !paneRe.test(html)) {
  console.error('o template mudou de forma e este script não sabe mais onde encaixar as abas.');
  process.exit(1);
}

html = html.replace(navRe, (_, a, b) => a + navHtml + b);
html = html.replace(paneRe, (_, a, b) => a + '\n' + panesHtml + '\n' + b);

// Aba do construtor de prompt. Tudo daqui para baixo só existe com --builder/--spec — sem
// eles o documento sai exatamente como sempre saiu. A injeção acontece ANTES do writeFileSync
// de propósito: se a spec for inválida ou o documento não tiver a forma esperada, o erro sai
// e nenhum arquivo é escrito.
let builderInfo = null;
const specFile = flag('spec');
if (argv.includes('--builder') || specFile) {
  try {
    if (specFile && !existsSync(specFile)) { console.error(`não achei a spec ${specFile}`); process.exit(2); }
    const xml = specFile ? readFileSync(specFile, 'utf8') : defaultSpecXml();
    const blocks = buildBlocks(xml, { tabLabel: flag('tab-label') });
    for (const w of blocks.warnings) console.error(`aviso:\n${w}`);
    html = injectInto(html, blocks);
    builderInfo = blocks;
  } catch (e) {
    if (!(e instanceof PbError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}

writeFileSync(out, html);
console.log(`${out} criado — ${tabs.length} abas: ${ids.map((i) => '#pane-' + i).join(' ')}`);
if (builderInfo)
  console.log(`  + aba "${builderInfo.label}" (#${builderInfo.paneId}) com o construtor #${builderInfo.shellId}`
            + ` — spec ${specFile ? specFile : 'padrão (planejamento)'}`);
console.log(`próximo: preencher os «...», depois  node ${resolve(HERE, 'check-doc.mjs')} ${out}`);
