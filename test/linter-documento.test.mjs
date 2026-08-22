/**
 * Regressão das checagens do check-doc.mjs que existiam ANTES do construtor: estrutura do
 * documento, abas/ARIA, blocos de código, recursos externos e sobras do template.
 *
 * Elas não mudaram na Onda 1 — e é justamente por isso que valem um teste: a Onda 1 mexeu
 * no mesmo arquivo, e o que se quer garantir é que nada aqui saiu do lugar de carona.
 * Como no outro arquivo, a asserção é sempre sobre o trecho da mensagem.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lintHtml } from './helpers/lint.mjs';
import { doc } from './fixtures/doc.mjs';

const BOOTSTRAP = '<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js" '
  + 'integrity="sha384-abc" crossorigin="anonymous"></script>';

const ABAS = `<ul class="nav nav-tabs" id="doc-tabs" role="tablist">
  <li class="nav-item" role="presentation">
    <button class="nav-link active" id="tab-a" data-bs-toggle="tab" data-bs-target="#pane-a"
            type="button" role="tab" aria-controls="pane-a" aria-selected="true">A</button>
  </li>
  <li class="nav-item" role="presentation">
    <button class="nav-link" id="tab-b" data-bs-toggle="tab" data-bs-target="#pane-b"
            type="button" role="tab" aria-controls="pane-b" aria-selected="false">B</button>
  </li>
</ul>
<div class="tab-content">
  <div class="tab-pane fade show active" id="pane-a" role="tabpanel" aria-labelledby="tab-a" tabindex="0">A</div>
  <div class="tab-pane fade" id="pane-b" role="tabpanel" aria-labelledby="tab-b" tabindex="0">B</div>
</div>
${BOOTSTRAP}`;

/** Documento com abas, opcionalmente com uma troca de texto aplicada. */
const comAbas = (de, para) => doc(de ? ABAS.replace(de, para) : ABAS, { hooks: false });

function erro(html, trecho) {
  const r = lintHtml(html);
  assert.ok(r.tem('erro', trecho), `esperava um ERRO contendo ${JSON.stringify(trecho)}.\n${r.out}`);
  assert.equal(r.code, 1, r.out);
}

function aviso(html, trecho) {
  const r = lintHtml(html);
  assert.ok(r.tem('aviso', trecho), `esperava um AVISO contendo ${JSON.stringify(trecho)}.\n${r.out}`);
}

function limpo(html) {
  const r = lintHtml(html);
  assert.deepEqual({ erros: r.erros, avisos: r.avisos }, { erros: [], avisos: [] }, r.out);
  assert.equal(r.code, 0);
}

// ──────────────────────────────────────────────────────────────── estrutura ──

describe('estrutura do documento', () => {
  test('<html> sem data-bs-theme="dark" é erro', () => {
    erro(doc('', { hooks: false }).replace(' data-bs-theme="dark"', ''), 'sem data-bs-theme="dark"');
  });

  test('<html> sem lang é aviso', () => {
    aviso(doc('', { hooks: false }).replace(' lang="pt-BR"', ''), '<html> sem lang');
  });

  test('sem <meta charset> é erro', () => {
    erro(doc('', { hooks: false }).replace('<meta charset="utf-8">', ''), 'sem <meta charset="utf-8">');
  });

  test('sem <meta name="color-scheme"> é aviso', () => {
    aviso(doc('', { hooks: false }).replace('<meta name="color-scheme" content="dark">', ''), 'color-scheme');
  });

  test('sem <meta name="viewport"> é aviso', () => {
    aviso(doc('', { hooks: false }).replace(/<meta name="viewport"[^>]*>/, ''), 'sem <meta name="viewport">');
  });

  test('sem <title> é erro', () => {
    erro(doc('', { hooks: false }).replace(/<title>[^<]*<\/title>/, ''), 'sem <title>');
  });

  test('sem <h1> é aviso', () => {
    aviso(doc('', { hooks: false }).replace(/<h1>[^<]*<\/h1>/, ''), 'sem <h1>');
  });

  test('dois <h1> é aviso', () => {
    aviso(doc('<h1>Outro</h1>', { hooks: false }), '2 elementos <h1>');
  });

  test('id duplicado é erro', () => {
    erro(doc('<div id="x"></div><div id="x"></div>', { hooks: false }), 'id duplicado "x"');
  });

  // A linha é o relatório: `lineOf()` devolvendo sempre 1 passava por esta suíte inteira.
  // O corpo de `doc()` começa sempre na linha 11, então os números aqui são determinísticos.
  test('id duplicado: a linha do SEGUNDO, citando a linha do primeiro', () => {
    const r = lintHtml(doc('<div id="x"></div>\n<p>meio</p>\n<div id="x"></div>', { hooks: false }));
    assert.equal(r.linha('erro', 'id duplicado'), 13, r.out);
    assert.ok(r.tem('erro', 'id duplicado "x" (também na linha 11)'), r.out);
  });

  test('a linha acompanha o problema quando ele desce no arquivo', () => {
    const enche = Array.from({ length: 20 }, (_, i) => `<p>linha de enchimento ${i}</p>`).join('\n');
    const r = lintHtml(doc(`${enche}\n<pre><code>ls</code></pre>`, { hooks: false }));
    assert.equal(r.linha('erro', 'sem class="language-XXX"'), 31, r.out);
  });
});

// ───────────────────────────────────────────────────────────────────── abas ──

describe('abas e ARIA', () => {
  test('o conjunto canônico de abas passa limpo', () => {
    limpo(comAbas());
  });

  test('abas sem o <script> do Bootstrap é erro', () => {
    erro(doc(ABAS.replace(BOOTSTRAP, ''), { hooks: false }), 'nenhum <script> do Bootstrap');
  });

  test('gatilho sem role="tab" é erro', () => {
    erro(comAbas(' role="tab" aria-controls="pane-a"', ' aria-controls="pane-a"'), 'sem role="tab"');
  });

  test('gatilho sem id é erro', () => {
    erro(comAbas(' id="tab-a"', ''), 'gatilho de aba sem id');
  });

  test('<button> de aba sem type="button" é aviso', () => {
    aviso(comAbas('type="button" role="tab" aria-controls="pane-a"', 'role="tab" aria-controls="pane-a"'),
      'sem type="button"');
  });

  test('gatilho sem data-bs-target é erro', () => {
    erro(comAbas(' data-bs-target="#pane-a"', ''), 'sem data-bs-target="#id-do-painel"');
  });

  test('data-bs-target apontando para painel inexistente é erro', () => {
    erro(comAbas('data-bs-target="#pane-a"', 'data-bs-target="#pane-z"'), 'não corresponde a nenhum .tab-pane');
  });

  test('aria-controls diferente do id do painel é erro', () => {
    erro(comAbas('aria-controls="pane-a"', 'aria-controls="pane-errado"'), 'deveria ser "pane-a"');
  });

  test('aria-labelledby do painel apontando para outro gatilho é erro', () => {
    erro(comAbas('aria-labelledby="tab-a"', 'aria-labelledby="tab-errado"'), 'esperado "tab-a"');
  });

  test('painel sem role="tabpanel" é erro', () => {
    erro(comAbas('id="pane-a" role="tabpanel"', 'id="pane-a"'), 'não tem role="tabpanel"');
  });

  test('painel sem tabindex é aviso', () => {
    aviso(comAbas('aria-labelledby="tab-a" tabindex="0"', 'aria-labelledby="tab-a"'), 'sem tabindex="0"');
  });

  test('aria-selected em desacordo com .active é erro', () => {
    erro(comAbas('aria-selected="true"', 'aria-selected="false"'), 'aria-selected deveria ser "true"');
  });

  test('gatilho e painel discordando sobre quem está ativo é erro', () => {
    erro(comAbas('class="tab-pane fade show active" id="pane-a"', 'class="tab-pane fade" id="pane-a"'),
      'discordam sobre quem está ativo');
  });

  test('painel ativo com .active e sem .show é erro', () => {
    erro(comAbas('class="tab-pane fade show active" id="pane-a"', 'class="tab-pane fade active" id="pane-a"'),
      'abre invisível');
  });

  test('sem role="tablist" é erro', () => {
    erro(comAbas('id="doc-tabs" role="tablist"', 'id="doc-tabs"'), 'nenhum role="tablist"');
  });

  test('dois gatilhos com .active para um tablist é erro', () => {
    erro(comAbas('class="nav-link" id="tab-b"', 'class="nav-link active" id="tab-b"'),
      'deve haver exatamente um por grupo');
  });

  test('painel sem aba que o abra é aviso', () => {
    const extra = '<div class="tab-pane fade" id="pane-orfao" role="tabpanel" tabindex="0">?</div>';
    aviso(doc(ABAS.replace('</div>\n' + BOOTSTRAP, extra + '</div>\n' + BOOTSTRAP), { hooks: false }),
      'não tem aba que o abra');
  });
});

// ───────────────────────────────────────────────────────── blocos de código ──

describe('blocos de código', () => {
  test('bloco sem class="language-XXX" é erro', () => {
    erro(doc('<pre><code>ls -la</code></pre>', { hooks: false }), 'sem class="language-XXX"');
  });

  test('class="nohighlight" dispensa a linguagem', () => {
    limpo(doc('<pre><code class="nohighlight">$ ls -la</code></pre>', { hooks: false }));
  });

  test('HTML não escapado dentro de <code> é erro', () => {
    erro(doc('<pre><code class="language-html"><div>oi</div></code></pre>', { hooks: false }),
      'HTML não escapado dentro de <code>');
  });

  test('data-allow-html isenta o bloco que pinta a própria saída', () => {
    limpo(doc('<pre><code class="language-html" data-allow-html><b>oi</b></code></pre>', { hooks: false }));
  });

  test('bloco de código vazio é aviso', () => {
    aviso(doc('<pre><code class="language-js"></code></pre>', { hooks: false }), 'bloco de código vazio');
  });

  test('`&` solto em <code> inline é aviso', () => {
    aviso(doc('<p>o operador <code>a & b</code> faz isso</p>', { hooks: false }), '`&` solto dentro de <code>');
  });
});

// ─────────────────────────────────────────────────────── recursos externos ──

describe('recursos externos', () => {
  const script = (src, extra = '') => doc(`<script src="${src}"${extra}></script>`, { hooks: false });

  test('http:// é erro', () => {
    erro(script('http://cdn.jsdelivr.net/npm/bootstrap@5.3.8/x.js', ' integrity="sha384-a" crossorigin="anonymous"'),
      'bloqueado como conteúdo misto');
  });

  test('CDN fora da lista conhecida é aviso', () => {
    aviso(script('https://exemplo.com/lib@1.2.3/x.js'), 'fora dos CDNs conhecidos');
  });

  test('@latest é erro', () => {
    erro(script('https://cdn.jsdelivr.net/npm/bootstrap@latest/dist/x.js'), 'versão flutuante');
  });

  test('URL de CDN sem versão é erro', () => {
    erro(script('https://cdn.jsdelivr.net/npm/bootstrap/dist/x.js'), 'sem versão');
  });

  test('versão parcial é aviso', () => {
    aviso(script('https://cdn.jsdelivr.net/npm/bootstrap@5.3/dist/x.js', ' integrity="sha384-a" crossorigin="anonymous"'),
      'versão parcial');
  });

  test('sem integrity é aviso', () => {
    aviso(script('https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/x.js'), 'sem integrity (SRI)');
  });

  test('integrity sem crossorigin é erro', () => {
    erro(script('https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/x.js', ' integrity="sha384-a"'),
      'sem crossorigin="anonymous"');
  });

  test('arquivo local ao lado é erro', () => {
    erro(script('./estilo.js'), 'o documento deixa de ser um arquivo único');
  });

  test('<link rel="stylesheet"> local é erro', () => {
    erro(doc('<link rel="stylesheet" href="estilo.css">', { hooks: false }), 'arquivo externo local');
  });

  test('<img> apontando para arquivo ao lado é erro', () => {
    erro(doc('<img src="grafico.png" alt="x">', { hooks: false }), 'aponta para arquivo ao lado');
  });

  test('<img> com data: URI passa', () => {
    limpo(doc('<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="x">', { hooks: false }));
  });
});

// ────────────────────────────────────────────────────── sobras do template ──

describe('sobras do template', () => {
  test('«placeholder» não preenchido é aviso', () => {
    aviso(doc('<p>«conteúdo»</p>', { hooks: false }), 'placeholder do template não preenchido');
  });

  test('TODO no documento é aviso', () => {
    aviso(doc('<p>TODO: escrever isto</p>', { hooks: false }), 'sobrou "TODO"');
  });

  test('TODO dentro de bloco de código NÃO é aviso', () => {
    limpo(doc('<pre><code class="language-js">// TODO: escrever isto</code></pre>', { hooks: false }));
  });
});

// ──────────────────────────────────────────────────────────── lacunas conhecidas ──
//
// Falhas REAIS do linter, encontradas ao escrever esta suíte e deixadas de propósito sem
// conserto: a Onda 1 não as introduziu (são anteriores ao construtor) e este sub-agente só
// escreve teste. Ficam como `todo` para não derrubar a suíte e não sumir da vista.
// Todas têm a mesma raiz: `attr()` e os regexes de `structure`/`externals`/`codeBlocks` só
// enxergam valor entre aspas DUPLAS, enquanto o `attrsOf()` novo do construtor já lê as duas.

describe('lacunas conhecidas do linter (não consertadas aqui)', () => {
  test('id duplicado com aspas simples devia ser erro — check-doc.mjs:171', { todo: 'bug pré-existente' }, () => {
    erro(doc("<div id='x'></div><div id='x'></div>", { hooks: false }), 'id duplicado');
  });

  test("<img src='arquivo.png'> devia ser erro — check-doc.mjs:338", { todo: 'bug pré-existente' }, () => {
    erro(doc("<img src='grafico.png' alt='x'>", { hooks: false }), 'aponta para arquivo ao lado');
  });

  test('<pre> com ">" no valor de um atributo esconde o bloco inteiro — check-doc.mjs:257',
    { todo: 'bug pré-existente' }, () => {
      erro(doc('<pre title="a > b"><code>ls</code></pre>', { hooks: false }), 'sem class="language-XXX"');
    });
});

// ─────────────────────────────────────────────────────────── linha de saída ──

describe('relato', () => {
  test('a linha do problema traz arquivo:linha e a dica', () => {
    const r = lintHtml(doc('<pre><code>ls</code></pre>', { hooks: false }));
    assert.match(r.out, /doc\.html:\d+ {2}bloco de código sem class/);
    assert.match(r.out, /↳ ex\.: <code class="language-ts">/);
  });

  test('--quiet não é exercitado aqui, mas o cabeçalho do arquivo sempre aparece', () => {
    const r = lintHtml(doc('<pre><code>ls</code></pre>', { hooks: false }));
    assert.match(r.out, /^\ndoc\.html$/m);
  });
});
