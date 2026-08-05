/**
 * lint.mjs — roda o `check-doc.mjs` de verdade, como processo, e devolve o que ele disse.
 *
 * Como processo e não como import: o linter termina com `process.exit()`, e o código de
 * saída (1 com erro, 0 com só aviso) é parte do contrato — é por ele que um CI reprova.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { SCRIPTS } from './pb.mjs';

export const CHECK_DOC = resolve(SCRIPTS, 'check-doc.mjs');

/** Roda o linter sobre arquivos já existentes. */
export function lintFiles(...files) {
  const r = spawnSync(process.execPath, [CHECK_DOC, ...files], { encoding: 'utf8' });
  if (r.error) throw r.error;
  const saida = (r.stdout || '') + (r.stderr || '');
  return {
    code: r.status,
    out: saida,
    erros: linhas(saida, 'erro'),
    avisos: linhas(saida, 'aviso'),
    /** A checagem X disparou? Compara pelo trecho da mensagem, nunca pela contagem total. */
    tem(nivel, trecho) {
      return (nivel === 'erro' ? this.erros : this.avisos).some((l) => l.includes(trecho));
    },
  };
}

/** Escreve o HTML num arquivo temporário e roda o linter sobre ele. */
export function lintHtml(html, nome = 'doc.html') {
  const dir = mkdtempSync(join(tmpdir(), 'html-explainer-test-'));
  const file = join(dir, nome);
  try {
    writeFileSync(file, html);
    return lintFiles(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** As linhas de problema de um nível. O linter as imprime como "  <nivel>  arquivo:linha  msg". */
function linhas(saida, nivel) {
  return saida
    .split('\n')
    .filter((l) => new RegExp(`^\\s{2}${nivel}\\s`).test(l))
    .map((l) => l.trim());
}
