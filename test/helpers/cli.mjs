/**
 * cli.mjs — roda `new-builder.mjs` e `new-doc.mjs` como PROCESSO, igual ao `lint.mjs` faz
 * com o `check-doc.mjs`, e pelo mesmo motivo: o código de saída é parte do contrato
 * (1 = spec/documento recusado, 2 = uso errado) e só existe de verdade num processo.
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
 * O stdout é redirecionado para um ARQUIVO, não para um cano: é exatamente o `> saida.html`
 * do README, o caminho que a documentação manda usar, e a escrita em arquivo é síncrona — a
 * saída chega inteira, sem depender do timing do leitor.
 *
 * Isso JÁ FOI um contorno para um bug: o `new-builder.mjs` terminava em `process.exit()` logo
 * depois de escrever ~27 KB, e num cano o Node descarta o que ainda não drenou (chegavam ~8 KB).
 * Hoje ele usa `process.exitCode` e o cano entrega tudo — `runPipe()` sobre ele é um teste que
 * PASSA, não uma medição de estrago. O `new-doc.mjs` e o `escape-code.mjs` ainda terminam em
 * `process.exit()`, então para eles a redireção continua sendo a captura confiável.
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

/**
 * O mesmo, mas com o stdout num CANO — o caminho de quem captura a saída de dentro de outro
 * processo. É o que expunha a truncagem do `process.exit()`; hoje serve para provar que ela
 * não acontece mais (e continua expondo o problema nos scripts que ainda usam `process.exit`).
 */
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
