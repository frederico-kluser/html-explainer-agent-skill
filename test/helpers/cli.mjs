/**
 * cli.mjs — roda `new-builder.mjs` e `new-doc.mjs` como PROCESSO, igual ao `lint.mjs` faz
 * com o `check-doc.mjs`, e pelo mesmo motivo: os dois terminam com `process.exit()`, e o
 * código de saída é parte do contrato (1 = spec/documento recusado, 2 = uso errado).
 *
 * Importar as funções puras (`buildBlocks`, `injectInto`, …) também vale e é feito nos testes
 * de unidade — mas só o processo exercita o parse de argv, a guarda de entrada e, sobretudo,
 * a promessa de que NENHUM arquivo é escrito quando algo falha.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SCRIPTS } from './pb.mjs';

export const NEW_BUILDER = resolve(SCRIPTS, 'new-builder.mjs');
export const NEW_DOC = resolve(SCRIPTS, 'new-doc.mjs');
export const ESCAPE_CODE = resolve(SCRIPTS, 'escape-code.mjs');

/**
 * Roda um script da skill e devolve `{ code, out, err }`. `cwd` opcional; `input` vai no stdin.
 *
 * O stdout é redirecionado para um ARQUIVO, não para um cano — é o `> saida.html` do README, e
 * é o único jeito de capturar a saída INTEIRA: os scripts terminam com `process.exit()`, que em
 * Node descarta o que ainda não foi drenado de um cano. Ver a lacuna conhecida documentada em
 * `new-builder.test.mjs` («stdout truncado»): pelo cano, `spawnSync` recebe ~7 KB dos 24 KB.
 * Quem quiser MEDIR essa truncagem usa `runPipe()`.
 */
export function run(script, args = [], opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'html-explainer-run-'));
  const saida = join(dir, 'stdout');
  const fd = openSync(saida, 'w');
  try {
    const r = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      cwd: opts.cwd,
      input: opts.input,
      stdio: ['pipe', fd, 'pipe'],
    });
    if (r.error) throw r.error;
    closeSync(fd);
    return { code: r.status, out: readFileSync(saida, 'utf8'), err: r.stderr || '' };
  } finally {
    try { closeSync(fd); } catch { /* já fechado no caminho feliz */ }
    rmSync(dir, { recursive: true, force: true });
  }
}

/** O mesmo, mas com o stdout num CANO — o que expõe a truncagem do `process.exit()`. */
export function runPipe(script, args = [], opts = {}) {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8', cwd: opts.cwd, input: opts.input,
  });
  if (r.error) throw r.error;
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

export const newBuilder = (args, opts) => run(NEW_BUILDER, args, opts);
export const newDoc = (args, opts) => run(NEW_DOC, args, opts);

/**
 * Um diretório temporário com um punhado de atalhos. Sempre em `try/finally`:
 * `const t = sandbox(); try { … } finally { t.rm(); }` — ou `before/after`.
 */
export function sandbox(prefix = 'html-explainer-cli-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    path: (n) => join(dir, n),
    write(n, txt) { const p = join(dir, n); writeFileSync(p, txt); return p; },
    read: (n) => readFileSync(join(dir, n), 'utf8'),
    has: (n) => existsSync(join(dir, n)),
    rm() { rmSync(dir, { recursive: true, force: true }); },
  };
}
