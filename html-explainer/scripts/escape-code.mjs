#!/usr/bin/env node
/**
 * escape-code.mjs — transforma código bruto em um bloco <pre><code> pronto para colar.
 *
 *   node escape-code.mjs arquivo.ts                  # linguagem deduzida da extensão
 *   node escape-code.mjs arquivo.html --lang html
 *   cat trecho.py | node escape-code.mjs --lang python
 *   node escape-code.mjs arquivo.ts --lines 10-25    # só um trecho
 *   node escape-code.mjs arquivo.ts --raw            # só escapa, sem <pre><code>
 *
 * Escapar & < > à mão é onde todo documento quebra: um `<` esquecido faz o
 * navegador engolir o resto do bloco como se fosse tag.
 */

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, def = null) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? def : argv[i + 1];
};
const has = (name) => argv.includes('--' + name);

if (has('help') || has('h')) {
  console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(2, 14).join('\n').replace(/^ \* ?/gm, ''));
  process.exit(0);
}

const file = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--lang'
                                                  && argv[argv.indexOf(a) - 1] !== '--lines');

// Mapa extensão → identificador que o highlight.js entende. O que não estiver aqui
// passa direto: `--lang` sempre vence.
const BY_EXT = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.py': 'python', '.rb': 'ruby', '.go': 'go',
  '.rs': 'rust', '.java': 'java', '.kt': 'kotlin', '.swift': 'swift', '.php': 'php',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp', '.cs': 'csharp',
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash', '.fish': 'bash',
  '.html': 'html', '.htm': 'html', '.xml': 'xml', '.svg': 'xml',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.json': 'json', '.yml': 'yaml', '.yaml': 'yaml', '.toml': 'ini', '.ini': 'ini',
  '.sql': 'sql', '.md': 'markdown', '.diff': 'diff', '.patch': 'diff',
  '.dockerfile': 'dockerfile', '.tf': 'hcl', '.lua': 'lua', '.vim': 'vim', '.ps1': 'powershell',
};

let source = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');

const range = flag('lines');
if (range) {
  const [a, b] = range.split('-').map(Number);
  const lines = source.split('\n');
  source = lines.slice(a - 1, b ?? a).join('\n');
  // Reindenta: trecho recortado do meio de uma função sai com 8 espaços à esquerda.
  const indent = Math.min(...source.split('\n').filter((l) => l.trim())
                                   .map((l) => l.match(/^\s*/)[0].length));
  if (indent > 0) source = source.split('\n').map((l) => l.slice(indent)).join('\n');
}

source = source.replace(/\s+$/, '');

/** & primeiro, sempre: inverter a ordem transformaria &lt; em &amp;lt;. */
const escaped = source
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

if (has('raw')) {
  process.stdout.write(escaped + '\n');
  process.exit(0);
}

const lang = flag('lang') || (file ? BY_EXT[extname(file).toLowerCase()] : null) || 'plaintext';

// Sem quebra de linha entre <pre>, <code> e o conteúdo: dentro de <pre> todo espaço
// em branco é significativo, e uma linha vazia extra aparece no topo do bloco.
process.stdout.write(`<pre><code class="language-${lang}">${escaped}</code></pre>\n`);
