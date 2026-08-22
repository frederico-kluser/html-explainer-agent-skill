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
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { lintFiles } from './helpers/lint.mjs';
import { ASSETS, SCRIPTS, ROOT } from './helpers/pb.mjs';

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
    dir = mkdtempSync(join(tmpdir(), 'html-explainer-agent-skill-newdoc-'));
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

// ───────────────────────────────────────────────────────── a própria suíte ──
//
// Dois acidentes silenciosos que já custaram caro em outros projetos, fixados aqui porque
// nenhum dos dois falha um teste — os dois fazem a suíte *parecer* verde.

describe('package.json — o que faz a suíte inteira rodar', () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

  test('o comando de teste não é uma glob expandida pelo SHELL', () => {
    // `node --test test/*.test.mjs` é expandido pelo shell ANTES do Node ver: um arquivo novo
    // em `test/sub/` some do comando sem uma linha de aviso, e a suíte segue verde sem ele.
    // A forma sem argumento deixa a descoberta com o Node, que varre `test/` recursivamente.
    assert.equal(pkg.scripts.test, 'node --test',
      'o script de teste voltou a depender de expansão do shell — um teste em subdiretório sumiria calado');
  });

  test('todo *.test.mjs de test/, inclusive em subdiretório, é alcançado pela descoberta do Node', () => {
    const achados = [];
    (function anda(dir, rel) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) anda(join(dir, e.name), `${rel}${e.name}/`);
        else if (e.name.endsWith('.test.mjs')) achados.push(rel + e.name);
      }
    })(resolve(ROOT, 'test'), '');
    assert.ok(achados.length >= 6, `achei só ${achados.length} arquivos de teste: ${achados}`);
    // A descoberta padrão do Node cobre `**/*.test.mjs` e tudo dentro de um diretório `test`:
    // basta então que todo arquivo esteja sob `test/`, que é o que esta varredura confere.
    for (const f of achados) assert.doesNotMatch(f, /^\.\./, f);
  });

  test('a versão do package.json acompanha o metadata.version do SKILL.md', () => {
    const skill = readFileSync(resolve(ROOT, 'html-explainer-agent-skill', 'SKILL.md'), 'utf8');
    const m = skill.match(/^\s*version:\s*"([^"]+)"/m);
    assert.ok(m, 'não achei metadata.version no SKILL.md');
    assert.equal(pkg.version, m[1],
      'package.json e SKILL.md divergem — na primeira publicação npm o pacote sai com a versão errada');
  });

  test('engines.node exige a faixa em que o runner de testes realmente funciona', () => {
    // Medido com binários reais: 18.0.0 não tem --test; 18.9.0 roda 4 testes e sai VERDE;
    // 18.13.0 estoura o lexer TAP nas aspas angulares do linter; 18.20.8 passa inteiro.
    assert.equal(pkg.engines.node, '>=18.20.8');
  });

  test('zero dependência: nada de dependencies, devDependencies nem lockfile', () => {
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.devDependencies, undefined);
    for (const f of ['node_modules', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'])
      assert.equal(existsSync(resolve(ROOT, f)), false, `${f} apareceu — a skill é de dependência zero`);
  });
});
