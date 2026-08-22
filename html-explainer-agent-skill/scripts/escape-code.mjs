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

/*
 * O corpo vive numa função para que cada saída antecipada seja um `return` com o código,
 * nunca um `process.exit()`. O motivo é o mesmo do `new-builder.mjs`: quando o stdout é um
 * CANO — `| pbcopy`, `| less`, CI, outro processo com spawn+pipe — a escrita do Node é
 * ASSÍNCRONA, e o que não coube no buffer do cano fica numa fila interna. `process.exit()`
 * derruba o processo na hora e joga essa fila fora. Aqui o estrago era o pior de todos:
 * medido com um arquivo de 600 KB, o `--raw` entregava 8192 dos 837780 bytes — 1% — e ainda
 * assim saía com código 0. Como o tamanho da saída é o do arquivo que o usuário passou, esse
 * script é justamente o que mais estoura o buffer do cano.
 *
 * (Para ARQUIVO a escrita é síncrona, e por isso o `> bloco.html` do README nunca truncou:
 * é o que fazia o bug parecer inofensivo.)
 */
function main() {
  if (has('help') || has('h')) {
    console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(2, 14).join('\n').replace(/^ \* ?/gm, ''));
    return 0;
  }

  // Varre por posição, não por valor: `--lang ts` e um arquivo chamado `ts` coexistem.
  const TAKES_VALUE = ['--lang', '--lines'];
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    if (TAKES_VALUE.includes(argv[i])) { i++; continue; }
    if (argv[i].startsWith('--')) continue;
    if (file === null) file = argv[i];
  }

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
    return 0;
  }

  const lang = flag('lang') || (file ? BY_EXT[extname(file).toLowerCase()] : null) || 'plaintext';

  // Sem quebra de linha entre <pre>, <code> e o conteúdo: dentro de <pre> todo espaço
  // em branco é significativo, e uma linha vazia extra aparece no topo do bloco.
  process.stdout.write(`<pre><code class="language-${lang}">${escaped}</code></pre>\n`);
  return 0;
}

process.exitCode = main();
