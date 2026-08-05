/**
 * Golden masters: os arquivos que a skill entrega precisam continuar passando no linter
 * dela própria. É o teste que pega a regressão mais cara de todas — a skill publicar um
 * exemplo que ela mesma reprova.
 *
 * Nos assets sem problema a asserção é exata (nenhum erro, nenhum aviso). Nos que têm
 * aviso de propósito (o template, cheio de «placeholders»), a asserção é sobre o número
 * de ERROS (zero, sempre) e sobre o exit code; a contagem de avisos vai junto porque ali
 * ela é o conteúdo do arquivo, não um efeito colateral de uma checagem nova.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { lintFiles } from './helpers/lint.mjs';
import { ASSETS, SCRIPTS } from './helpers/pb.mjs';

const asset = (n) => resolve(ASSETS, n);

describe('golden masters — os assets da skill', () => {
  test('example.html passa sem problema nenhum', () => {
    const r = lintFiles(asset('example.html'));
    assert.deepEqual({ erros: r.erros, avisos: r.avisos }, { erros: [], avisos: [] }, r.out);
    assert.equal(r.code, 0);
  });

  test('prompt-builder.html passa sem problema nenhum', () => {
    const r = lintFiles(asset('prompt-builder.html'));
    assert.deepEqual({ erros: r.erros, avisos: r.avisos }, { erros: [], avisos: [] }, r.out);
    assert.equal(r.code, 0);
  });

  test('template.html: 0 erros e 16 avisos, todos de «placeholder»', () => {
    const r = lintFiles(asset('template.html'));
    assert.deepEqual(r.erros, [], r.out);
    assert.equal(r.avisos.length, 16, r.out);
    for (const a of r.avisos) assert.match(a, /placeholder do template não preenchido/);
    assert.equal(r.code, 0, 'só com aviso o linter sai com 0');
  });

  test('os três assets de uma vez saem com 0', () => {
    const r = lintFiles(asset('example.html'), asset('template.html'), asset('prompt-builder.html'));
    assert.deepEqual(r.erros, [], r.out);
    assert.equal(r.code, 0);
  });
});

describe('golden master — o documento que o new-doc.mjs gera', () => {
  let dir;
  let out;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'html-explainer-newdoc-'));
    out = join(dir, 'gerado.html');
    const r = spawnSync(process.execPath,
      [resolve(SCRIPTS, 'new-doc.mjs'), 'T', out, '--tabs', 'A,B'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  test('0 erros e 6 avisos de «placeholder», exit 0', () => {
    const r = lintFiles(out);
    assert.deepEqual(r.erros, [], r.out);
    assert.equal(r.avisos.length, 6, r.out);
    for (const a of r.avisos) assert.match(a, /placeholder do template não preenchido/);
    assert.equal(r.code, 0);
  });
});

describe('exit code', () => {
  test('1 quando há erro', () => {
    const r = lintFiles(join(tmpdir(), 'nao-existe-' + Date.now() + '.html'));
    assert.equal(r.code, 1, r.out);
  });

  test('2 quando não recebe arquivo nenhum', () => {
    const r = lintFiles();
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /uso: node check-doc\.mjs/);
  });
});
