/**
 * doc.mjs — as peças com que cada fixture do linter é montada.
 *
 * A ideia: um documento BASE que passa limpo no linter e, em cima dele, uma peça trocada
 * por vez. Assim cada teste dispara *aquela* checagem e nenhuma outra — que é o que faz a
 * mensagem de falha apontar para o bug certo. Sem tabs no base, de propósito: sem gatilho
 * de aba o `tabs()` desiste na primeira linha e não há ruído de ARIA para filtrar.
 */

/**
 * Os dois ganchos do §4 do contrato, em JS de verdade dentro de um `<script>`.
 * Toda fixture com construtor os carrega: na Onda 2 a ausência deles vira ERRO, e um
 * fixture que só falha depois do merge não é fixture, é dívida.
 */
export const HOOKS = `<script>
(function () {
  var sources = new Map();
  document.querySelectorAll('pre > code').forEach(function (code) {
    if (code.closest('[data-live]')) return;   // texto muda em runtime: leia na hora do clique
    sources.set(code, code.textContent.replace(/\\n$/, ''));
  });
  function copyText(t) { return Promise.resolve(t); }
  window.__explainerCopy = copyText;
})();
</script>`;

/** A saída padrão do construtor base, já escapada como o documento a traz. */
export const SAIDA_PADRAO = `&lt;root&gt;
  &lt;a/&gt;
&lt;/root&gt;`;

/** Spec canônica: um radio, um template, tudo válido. */
export function spec({ id = 'x', body = null, tipo = 'application/xml', scriptId = 'pb-spec-x' } = {}) {
  const miolo = body ?? `<prompt-builder id="${id}" lang="xml" title="Construtor de teste">
  <question id="modo" type="radio" label="Modo de operacao">
    <option value="a" label="Alfa" default="true"><![CDATA[<a/>]]></option>
    <option value="b" label="Beta"><![CDATA[<b/>]]></option>
  </question>
  <template><![CDATA[
<root>
  {{modo}}
</root>
  ]]></template>
</prompt-builder>`;
  const attrId = scriptId === null ? '' : ` id="${scriptId}"`;
  return `<script type="${tipo}"${attrId}>\n${miolo}\n</script>`;
}

/** Casca canônica: todos os ganchos do §3 presentes. */
export function shell({
  id = 'pb-x',
  spec: specId = 'pb-spec-x',
  form = '<div data-pb-form><noscript>Sem JavaScript as perguntas nao sao montadas.</noscript></div>',
  copy = '<button type="button" data-pb-copy>Copiar prompt</button>',
  reset = '<button type="button" data-pb-reset>Restaurar padroes</button>',
  status = '<span data-pb-status aria-live="polite">prompt padrao</span>',
  saida = `<pre data-live><code class="language-xml" data-pb-output>${SAIDA_PADRAO}</code></pre>`,
  tag = 'div',
  extra = '',
} = {}) {
  const specAttr = specId === null ? '' : ` data-pb-spec="${specId}"`;
  const idAttr = id === null ? '' : ` id="${id}"`;
  return `<${tag} class="prompt-builder"${idAttr}${specAttr}>
  ${form}
  ${copy}
  ${reset}
  ${status}
  ${extra}
  ${saida}
</${tag}>`;
}

/**
 * Documento inteiro. `corpo` entra dentro do `<body>`; `hooks: false` tira os dois ganchos
 * do §4 (usado só pelo fixture que testa a ausência deles).
 */
export function doc(corpo = '', { hooks = true, titulo = 'Documento de teste' } = {}) {
  return `<!doctype html>
<html lang="pt-BR" data-bs-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${titulo}</title>
</head>
<body>
<h1>${titulo}</h1>
${corpo}
${hooks ? HOOKS : ''}
</body>
</html>
`;
}

/** Atalho: documento base + spec + casca, cada uma parametrizável. */
export function docComConstrutor({ specOpts = {}, shellOpts = {}, docOpts = {}, antes = '', depois = '' } = {}) {
  return doc(`${antes}\n${spec(specOpts)}\n${shell(shellOpts)}\n${depois}`, docOpts);
}

/** Só o miolo do `<prompt-builder>`, para os fixtures que mexem na spec. */
export function promptBuilderXml(perguntas, template = '<template><![CDATA[\n<root>\n  {{modo}}\n</root>\n]]></template>', attrs = 'id="x" lang="xml"') {
  return `<prompt-builder ${attrs}>\n${perguntas}\n${template}\n</prompt-builder>`;
}
