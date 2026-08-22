/**
 * pb.mjs — carrega a camada pura do construtor de prompt, sem navegador.
 *
 * O runtime vive dentro de `assets/prompt-builder.html`, entre os marcadores
 * `pb:runtime:begin`/`pb:runtime:end`. Ele foi escrito para isso: a IIFE instala
 * `__promptBuilder` no global e só depois pergunta se existe `document` — em Node
 * não existe, e a execução para ali, com as funções puras já expostas.
 *
 * O teste roda o arquivo REAL, nunca uma cópia: uma cópia envelheceria em silêncio.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..');
export const ASSETS = resolve(ROOT, 'html-explainer-agent-skill', 'assets');
export const SCRIPTS = resolve(ROOT, 'html-explainer-agent-skill', 'scripts');

export const BUILDER_HTML = readFileSync(resolve(ASSETS, 'prompt-builder.html'), 'utf8');

/** O JS entre `<!-- pb:runtime:begin -->` e `<!-- pb:runtime:end -->`. */
export function runtimeSource(html = BUILDER_HTML) {
  const bloco = html.match(/<!-- pb:runtime:begin -->\s*<script>([\s\S]*?)<\/script>\s*<!-- pb:runtime:end -->/);
  if (!bloco) throw new Error('não achei o bloco pb:runtime no prompt-builder.html');
  return bloco[1];
}

/**
 * Executa o runtime num escopo próprio e devolve `{ parse, model, defaults, build,
 * fragment, dedent }`. `parse` depende de `DOMParser` e não é usável aqui — o caminho
 * sem navegador é `parseXml()` do mini-xml + `model()`.
 */
export function loadPromptBuilder() {
  const antes = globalThis.__promptBuilder;
  try {
    new Function(runtimeSource())();
    const PB = globalThis.__promptBuilder;
    if (!PB) throw new Error('o runtime não instalou globalThis.__promptBuilder');
    return PB;
  } finally {
    if (antes === undefined) delete globalThis.__promptBuilder;
    else globalThis.__promptBuilder = antes;
  }
}

/** A spec XML declarada no `<script type="application/xml">` do arquivo de referência. */
export function specSource(html = BUILDER_HTML) {
  const m = html.match(/<script type="application\/xml"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('não achei a spec no prompt-builder.html');
  return m[1];
}

/**
 * O texto (já desescapado) do `<code data-pb-output>` pré-preenchido num documento.
 * A linguagem não é fixada em `xml` de propósito: o gerador copia o `lang` da spec para a
 * classe, e o teste do documento GERADO precisa achar o bloco com qualquer linguagem.
 */
export function outputSource(html = BUILDER_HTML) {
  const m = html.match(/<code class="language-[^"]*" data-pb-output>([\s\S]*?)<\/code>/);
  if (!m) throw new Error('não achei o <code data-pb-output> no HTML');
  return unescapeHtml(m[1]);
}

export function unescapeHtml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
