/**
 * `escape-code.mjs` — o terceiro script da skill, e o único que não tinha teste nem menção.
 *
 * Ele é pequeno e é usado em todo documento: escapar `& < >` à mão é onde o HTML de arquivo
 * único quebra (um `<` esquecido faz o navegador engolir o resto do bloco como tag), e o
 * linter reprova exatamente isso. Um defeito aqui vira documento reprovado — ou, pior,
 * documento aceito com o bloco comido.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { run, sandbox, ESCAPE_CODE } from './helpers/cli.mjs';
import { lintHtml } from './helpers/lint.mjs';
import { doc } from './fixtures/doc.mjs';

const esc = (args, opts) => run(ESCAPE_CODE, args, opts);

describe('escape-code — o bloco pronto para colar', () => {
  test('escapa & < > e embrulha em <pre><code class="language-…">', () => {
    const r = esc(['--lang', 'html'], { input: '<div class="a">x & y</div>' });
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, '<pre><code class="language-html">&lt;div class="a"&gt;x &amp; y&lt;/div&gt;</code></pre>\n');
  });

  test('o & vem PRIMEIRO: &lt; do original não vira &amp;lt;', () => {
    const r = esc(['--lang', 'text'], { input: '&lt;' });
    assert.equal(r.out, '<pre><code class="language-text">&amp;lt;</code></pre>\n');
  });

  test('sem quebra de linha entre <pre>, <code> e o conteúdo — dentro de <pre> tudo conta', () => {
    const r = esc(['--lang', 'js'], { input: 'a\nb\n' });
    assert.equal(r.out, '<pre><code class="language-js">a\nb</code></pre>\n');
  });

  test('a linguagem sai da extensão do arquivo', () => {
    const t = sandbox();
    try {
      for (const [nome, lang] of [['x.ts', 'typescript'], ['x.mjs', 'javascript'], ['x.yml', 'yaml'],
                                  ['x.svg', 'xml'], ['x.toml', 'ini']]) {
        const f = t.write(nome, 'oi');
        assert.match(esc([f]).out, new RegExp(`class="language-${lang}"`), nome);
      }
    } finally { t.rm(); }
  });

  test('extensão desconhecida cai em plaintext, e --lang sempre vence', () => {
    const t = sandbox();
    try {
      const f = t.write('x.qualquer', 'oi');
      assert.match(esc([f]).out, /class="language-plaintext"/);
      assert.match(esc([f, '--lang', 'ruby']).out, /class="language-ruby"/);
      assert.match(esc([t.write('y.ts', 'oi'), '--lang', 'ruby']).out, /class="language-ruby"/);
    } finally { t.rm(); }
  });

  test('--raw só escapa, sem o embrulho', () => {
    const r = esc(['--raw'], { input: '<a>&</a>' });
    assert.equal(r.out, '&lt;a&gt;&amp;&lt;/a&gt;\n');
  });

  test('--lines recorta o trecho E tira a indentação comum dele', () => {
    const t = sandbox();
    try {
      const f = t.write('x.js', 'function f() {\n  if (a) {\n    b();\n    c();\n  }\n}\n');
      assert.equal(esc([f, '--lines', '3-4', '--raw']).out, 'b();\nc();\n');
      assert.equal(esc([f, '--lines', '3', '--raw']).out, 'b();\n');
    } finally { t.rm(); }
  });

  test('o branco do fim do arquivo é aparado — senão o bloco abre com uma linha vazia', () => {
    assert.equal(esc(['--raw'], { input: 'a\n\n\n   \n' }).out, 'a\n');
  });

  test('--help imprime o cabeçalho de uso e sai com 0', () => {
    const r = esc(['--help']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /node escape-code\.mjs arquivo\.ts/);
    assert.match(r.out, /--raw/);
  });

  test('um arquivo com nome "ts" e --lang ts coexistem — a varredura é por posição', () => {
    const t = sandbox();
    try {
      const f = t.write('ts', '<x/>');
      assert.equal(esc([f, '--lang', 'ts'], { cwd: t.dir }).out,
        '<pre><code class="language-ts">&lt;x/&gt;</code></pre>\n');
    } finally { t.rm(); }
  });

  // O contrato de verdade: a saída deste script tem de passar no linter do outro.
  test('o bloco que ele produz passa no check-doc.mjs — o & < > escapado é o que o linter exige', () => {
    const bloco = esc(['--lang', 'html'], { input: '<section id="x">a & b</section>' }).out.trim();
    const r = lintHtml(doc(bloco, { hooks: false }));
    assert.deepEqual({ erros: r.erros, avisos: r.avisos }, { erros: [], avisos: [] }, r.out);
  });

  test('sem escapar, o MESMO conteúdo é reprovado — é a checagem que este script existe para atender', () => {
    const r = lintHtml(doc('<pre><code class="language-html"><section id="x">a & b</section></code></pre>',
      { hooks: false }));
    assert.ok(r.tem('erro', 'HTML não escapado dentro de <code>'), r.out);
  });
});
