/**
 * O GERADOR — `new-builder.mjs` e o `--builder` do `new-doc.mjs`.
 *
 * A suíte antiga protegia `assets/prompt-builder.html`: UM arquivo, escrito à mão, que ninguém
 * regera. Este arquivo protege a fábrica — o código que produz TODO documento que a skill vier
 * a entregar. A diferença aparece numa mutação de uma linha: trocar, dentro do gerador,
 *
 *     const prompt = PB.build(model, PB.defaults(model));   →   const prompt = model.template;
 *
 * deixa o documento entregue com `{{alvo}}` cru no bloco de saída — a mentira exata que o
 * bloco pré-preenchido existe para impedir — e o linter aprova, porque marcador em bloco de
 * código é conteúdo legítimo. O teste-jóia daqui («byte a byte») é o que mata essa mutação:
 * ele refaz a montagem a partir da spec que o próprio documento gerado carrega e compara com
 * o que está escrito nele, sobre uma spec DIFERENTE da de referência.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildBlocks, injectInto, parseXml, validateSpec, defaultSpecXml, EXAMPLE_SPEC, PbError,
} from '../html-explainer/scripts/new-builder.mjs';
import { loadPromptBuilder, outputSource, ASSETS, ROOT } from './helpers/pb.mjs';
import { parseXml as miniParse } from './helpers/mini-xml.mjs';
import { run, runPipe, newBuilder, newDoc, sandbox, NEW_BUILDER } from './helpers/cli.mjs';
import { lintFiles } from './helpers/lint.mjs';

const PB = loadPromptBuilder();

// ─────────────────────────────────────────────────────────────── a spec-cobaia ──
//
// Deliberadamente DIFERENTE da de referência em tudo que o gerador copia da spec: outro id
// (vira todos os ids gerados), outro `lang` (vira a classe do <code>), outro título, os quatro
// tipos de pergunta, dois `join` distintos, um checkbox sem nenhuma marcada (a linha do
// marcador tem de sumir), marcador com indentação de dois níveis, marcador NO MEIO de uma
// linha, e `&`, `<` e `>` no texto — que só saem certos se o escape do <code> for aplicado.

const SPEC_ALT = `<prompt-builder id="entrega" lang="markdown" title="Monte o prompt da entrega">

  <question id="alvo" type="text"
            label="O que entregar"
            placeholder="ex.: o relatório de fechamento"
            default="O relatório de fechamento de a &amp; b"/>

  <question id="contexto" type="textarea"
            label="Contexto"
            default="Duas equipes leem isto.&#10;O prazo é sexta."/>

  <question id="tom" type="radio" label="Tom">
    <option value="seco" label="Seco"><![CDATA[Tom: seco. Nada de floreio.]]></option>
    <option value="didatico" label="Didático" default="true"><![CDATA[Tom: didático — explique cada passo.
Um exemplo por afirmação: custo > 0 & margem > 10%.]]></option>
    <option value="formal" label="Formal"><![CDATA[Tom: formal.]]></option>
  </question>

  <question id="secoes" type="checkbox" join="comma" label="Seções">
    <option value="resumo" label="Resumo" default="true"><![CDATA[resumo]]></option>
    <option value="riscos" label="Riscos" default="true"><![CDATA[riscos]]></option>
    <option value="anexos" label="Anexos"><![CDATA[anexos]]></option>
  </question>

  <question id="extras" type="checkbox" join="blank-line" label="Extras">
    <option value="glossario" label="Glossário"><![CDATA[Inclua um glossário ao final.]]></option>
    <option value="fontes" label="Fontes"><![CDATA[Liste as fontes.]]></option>
  </question>

  <template><![CDATA[
    # Entrega: {{alvo}}

    ## Contexto
      {{contexto}}

    ## Estilo
    {{tom}}

    ## Seções obrigatórias
    {{secoes}}

    {{extras}}

    Fim.
  ]]></template>

</prompt-builder>
`;

/** Uma spec mínima e válida, para os fixtures que só precisam de "alguma spec que passa". */
const specMinima = (id = 'min') => `<prompt-builder id="${id}" lang="xml">
  <question id="modo" type="radio" label="Modo">
    <option value="a" label="Alfa" default="true"><![CDATA[<a/>]]></option>
    <option value="b" label="Beta"><![CDATA[<b/>]]></option>
  </question>
  <template><![CDATA[
<root>
  {{modo}}
</root>
  ]]></template>
</prompt-builder>`;

/** A mensagem do PbError que `buildBlocks` lança para esta spec — ou falha o teste. */
function erroDeSpec(xml, opts) {
  try {
    buildBlocks(xml, opts);
  } catch (e) {
    assert.ok(e instanceof PbError, `esperava um PbError, veio ${e.stack}`);
    return e.message;
  }
  assert.fail(`esta spec devia ter sido RECUSADA, e passou:\n${xml}`);
}

/** Os avisos que `buildBlocks` devolve para esta spec (que precisa ser válida). */
const avisosDe = (xml) => buildBlocks(xml).warnings;

// ══════════════════════════════════════════════════ o documento não pode mentir ══

describe('gerador — byte a byte: o bloco pré-preenchido é o que o runtime monta', () => {
  const t = sandbox('html-explainer-gerador-');
  after(() => t.rm());

  /**
   * Refaz a montagem a partir do que o DOCUMENTO GERADO carrega — a spec que está dentro
   * dele — e compara com o texto que está escrito nele. Nada aqui vem do gerador: se ele
   * copiar o bloco da referência, devolver o template cru, esquecer o escape ou trocar a
   * indentação por um espaço, os dois lados divergem.
   */
  function conferePreenchido(html, ctx) {
    const m = html.match(/<script type="application\/xml" id="[^"]*">\n([\s\S]*?)\n<\/script>/);
    assert.ok(m, `${ctx}: não achei a spec dentro do documento gerado`);
    const model = PB.model(miniParse(m[1]));
    const esperado = PB.build(model, PB.defaults(model));
    const escrito = outputSource(html);
    assert.equal(escrito, esperado,
      `${ctx}: o prompt escrito no documento GERADO divergiu do que o runtime monta na combinação `
      + 'padrão — quem abre sem JavaScript, e quem imprime em PDF, recebe um prompt que o '
      + 'construtor nunca produziria');
    return escrito;
  }

  test('new-doc.mjs --builder --spec: o <code data-pb-output> === build(model, defaults(model))', () => {
    const spec = t.write('alt.xml', SPEC_ALT);
    const out = t.path('alt.html');
    const r = newDoc(['Doc da entrega', out, '--tabs', 'A,B', '--builder', '--spec', spec]);
    assert.equal(r.code, 0, r.err);
    conferePreenchido(t.read('alt.html'), 'new-doc --spec');
  });

  test('new-builder.mjs --into: o mesmo, pelo outro caminho de geração', () => {
    const spec = t.write('alt2.xml', SPEC_ALT);
    const out = t.path('into.html');
    assert.equal(newDoc(['Doc', out, '--tabs', 'A,B']).code, 0);
    const r = newBuilder([spec, '--into', out]);
    assert.equal(r.code, 0, r.err);
    conferePreenchido(t.read('into.html'), 'new-builder --into');
  });

  test('new-doc.mjs --builder (spec padrão): idem, com a spec de planejamento', () => {
    const out = t.path('padrao.html');
    assert.equal(newDoc(['Plano', out, '--tabs', 'A,B', '--builder']).code, 0);
    conferePreenchido(t.read('padrao.html'), 'new-doc --builder');
  });

  // Redundante com o byte-a-byte, e de propósito: esta é a asserção que NOMEIA o defeito.
  // Se o gerador entregar o template cru, o teste acima diz "divergiu" e este diz o quê.
  test('o bloco pré-preenchido NÃO traz {{marcador}} nenhum — é prompt montado, não template', () => {
    const html = t.read('alt.html');
    const escrito = outputSource(html);
    assert.equal(escrito.match(/\{\{[^{}]*\}\}/g), null,
      'sobrou marcador no bloco pré-preenchido: o gerador entregou o TEMPLATE em vez do prompt montado');
    assert.match(escrito, /^# Entrega: O relatório de fechamento de a & b$/m,
      'o default do <question type="text"> tinha de estar substituído na primeira linha');
    // E, no HTML CRU, o mesmo `&` tem de estar escapado — senão o navegador o come.
    assert.match(html, /# Entrega: O relatório de fechamento de a &amp; b/);
  });

  test('o <code> herda o lang da spec, e o & < > do prompt saem escapados', () => {
    const html = t.read('alt.html');
    assert.match(html, /<code class="language-markdown" data-pb-output>/,
      'o lang="markdown" da spec tinha de virar a classe do bloco');
    const cru = html.match(/data-pb-output>([\s\S]*?)<\/code>/)[1];
    assert.match(cru, /custo &gt; 0 &amp; margem &gt; 10%/, 'o fragmento do radio tinha de sair escapado');
    assert.equal(cru.includes('<'), false, 'nenhum "<" cru pode sobrar dentro do <code>');
  });

  test('o [data-pb-status] do documento gerado conta as linhas que a saída realmente tem', () => {
    const html = t.read('alt.html');
    const escrito = outputSource(html);
    const status = html.match(/prompt padrão · (\d+) linhas/);
    assert.ok(status, 'não achei o status "prompt padrão · N linhas" no documento gerado');
    assert.equal(Number(status[1]), escrito.split('\n').length);
  });

  test('a linha do checkbox sem nenhuma marcada some do prompt, sem deixar {{extras}}', () => {
    const escrito = outputSource(t.read('alt.html'));
    assert.equal(escrito.includes('extras'), false, escrito);
    assert.match(escrito, /resumo, riscos/, 'o join="comma" tinha de unir as duas marcadas');
  });

  test('o documento gerado passa no linter da própria skill: 0 erros', () => {
    const r = lintFiles(t.path('alt.html'));
    assert.deepEqual(r.erros, [], r.out);
    assert.equal(r.code, 0);
  });
});

// ═══════════════════════════════════════════════════════════ os blocos montados ══

describe('buildBlocks — os pedaços que a aba precisa', () => {
  const b = buildBlocks(SPEC_ALT);

  test('todo id gerado sai do id da spec', () => {
    assert.deepEqual(
      { id: b.id, specId: b.specId, shellId: b.shellId, paneId: b.paneId, tabId: b.tabId },
      { id: 'entrega', specId: 'pb-spec-entrega', shellId: 'pb-entrega',
        paneId: 'pane-pb-entrega', tabId: 'tab-pb-entrega' });
  });

  test('o XML do autor entra na spec sem uma vírgula de diferença', () => {
    assert.ok(b.specBlock.includes(SPEC_ALT.trim()),
      'o gerador reescreveu a spec do autor — ela tem de entrar literal no <script>');
    assert.match(b.specBlock, /<script type="application\/xml" id="pb-spec-entrega">/);
  });

  test('a casca não guarda nenhum resquício do pb-plano da referência', () => {
    assert.equal(b.shellBlock.includes('pb-plano'), false, b.shellBlock);
    assert.match(b.shellBlock, /id="pb-entrega" data-pb-spec="pb-spec-entrega"/);
  });

  test('o runtime é copiado byte a byte da referência', () => {
    const ref = readFileSync(resolve(ASSETS, 'prompt-builder.html'), 'utf8');
    const i = ref.indexOf('<!-- pb:runtime:begin -->');
    const j = ref.indexOf('<!-- pb:runtime:end -->') + '<!-- pb:runtime:end -->'.length;
    assert.equal(b.runtimeBlock, ref.slice(i, j),
      'o gerador reimplementou/reformatou o runtime — ele tem de ser a mesma sequência de bytes '
      + 'da referência, senão o documento entregue e o arquivo de referência divergem');
  });

  test('o CSS de impressão vai junto — sem ele o PDF corta o prompt nos 30rem do <pre>', () => {
    assert.match(b.cssBlock, /\.prompt-builder pre \{ max-height: none !important/);
    assert.match(b.cssBlock, /\.prompt-builder \.position-sticky \{ position: static !important/);
  });

  test('o <li> e o painel apontam um para o outro pelos ids do §', () => {
    assert.match(b.navLi, /id="tab-pb-entrega"[\s\S]*data-bs-target="#pane-pb-entrega"[\s\S]*aria-controls="pane-pb-entrega"/);
    assert.match(b.paneBlock, /id="pane-pb-entrega"[\s\S]*aria-labelledby="tab-pb-entrega"/);
  });

  test('o título do painel vem do title da spec', () => {
    assert.match(b.paneBlock, /<h2 class="h4">Monte o prompt da entrega<\/h2>/);
  });
});

describe('buildBlocks — --tab-label', () => {
  test('sem a flag o rótulo é "Construtor"', () => {
    const b = buildBlocks(specMinima());
    assert.equal(b.label, 'Construtor');
    assert.match(b.navLi, /<\/i>Construtor\n/);
    assert.match(b.paneBlock, /data-print-title="Construtor"/);
  });

  test('com a flag o rótulo troca na aba E no data-print-title', () => {
    const b = buildBlocks(specMinima(), { tabLabel: 'Montar o pedido' });
    assert.equal(b.label, 'Montar o pedido');
    assert.match(b.navLi, /<\/i>Montar o pedido\n/);
    assert.match(b.paneBlock, /data-print-title="Montar o pedido"/);
  });

  test('rótulo com & < > " sai escapado nos dois lugares', () => {
    const b = buildBlocks(specMinima(), { tabLabel: 'A & B <x> "y"' });
    assert.match(b.navLi, /<\/i>A &amp; B &lt;x&gt; &quot;y&quot;\n/);
    assert.match(b.paneBlock, /data-print-title="A &amp; B &lt;x&gt; &quot;y&quot;"/);
  });

  test('sem title na spec, o rótulo também vira o <h2> do painel', () => {
    const b = buildBlocks(specMinima(), { tabLabel: 'Rotulo' });
    assert.match(b.paneBlock, /<h2 class="h4">Rotulo<\/h2>/);
  });

  test('--tab-label chega pela linha de comando até o documento', () => {
    const t = sandbox();
    try {
      const spec = t.write('s.xml', specMinima());
      const out = t.path('d.html');
      assert.equal(newDoc(['T', out, '--tabs', 'A,B']).code, 0);
      assert.equal(newBuilder([spec, '--into', out, '--tab-label', 'Montar o pedido']).code, 0);
      const html = t.read('d.html');
      assert.match(html, /<\/i>Montar o pedido\n/);
      assert.match(html, /data-print-title="Montar o pedido"/);
      assert.equal(html.includes('>Construtor\n'), false, 'sobrou o rótulo padrão');
    } finally { t.rm(); }
  });
});

// ═══════════════════════════════════════════════════════════════ os três modos ══

describe('modo --example', () => {
  test('escreve a spec de partida no stdout, exit 0, sem tocar em disco', () => {
    const t = sandbox();
    try {
      const r = newBuilder(['--example'], { cwd: t.dir });
      assert.equal(r.code, 0, r.err);
      assert.equal(r.out, EXAMPLE_SPEC);
      assert.ok(r.out.length > 2000, `a spec de exemplo saiu com ${r.out.length} bytes — vazia ou truncada`);
      assert.match(r.out, /<prompt-builder id="revisao"/);
      assert.deepEqual(readdirSync(t.dir), [], 'o --example não pode criar arquivo nenhum');
    } finally { t.rm(); }
  });

  test('a spec de exemplo é ela própria válida — e gera sem aviso nenhum', () => {
    const b = buildBlocks(EXAMPLE_SPEC);
    assert.equal(b.id, 'revisao');
    assert.deepEqual(b.warnings, [], 'a spec que a ferramenta entrega como ponto de partida não pode avisar nada');
    assert.equal(b.prompt.includes('{{'), false, 'o prompt de exemplo saiu com marcador cru');
  });

  test('--example vence o resto: nem lê o arquivo positional', () => {
    const r = newBuilder(['--example', 'nao-existe.xml']);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, EXAMPLE_SPEC);
  });
});

describe('modo stdout — os quatro pedaços para colar à mão', () => {
  const t = sandbox();
  let r;
  before(() => { r = newBuilder([t.write('s.xml', SPEC_ALT)]); });
  after(() => t.rm());

  test('sai com 0 e imprime os três blocos numerados, na ordem em que se cola', () => {
    assert.equal(r.code, 0, r.err);
    const ordem = ['1/3 · a ABA', '2/3 · o PAINEL', '3/3 · o RUNTIME'];
    let i = -1;
    for (const trecho of ordem) {
      const j = r.out.indexOf(trecho);
      assert.ok(j > i, `"${trecho}" fora de ordem (ou ausente) na saída:\n${r.out.slice(0, 400)}`);
      i = j;
    }
  });

  test('o quarto pedaço — o CSS de impressão — sai junto, que é o que todo mundo esquece', () => {
    assert.match(r.out, /pb:print:begin/);
    assert.match(r.out, /@media print do <style>/);
  });

  test('o resumo vai para o STDERR, para não sujar o bloco que se redireciona', () => {
    assert.match(r.err, /construtor #pb-entrega · \d+ linhas de prompt padrão/);
    assert.equal(r.out.includes('linhas de prompt padrão'), false);
  });

  test('sem spec nenhuma: uso no stderr e exit 2', () => {
    const x = newBuilder([]);
    assert.equal(x.code, 2);
    assert.match(x.err, /uso:\n {2}node new-builder\.mjs --example/);
  });

  test('spec que não existe: exit 2 e a mensagem nomeia o arquivo', () => {
    const x = newBuilder(['nao-existe.xml']);
    assert.equal(x.code, 2);
    assert.match(x.err, /não achei a spec nao-existe\.xml/);
  });

  test('--help imprime o uso e sai com 0', () => {
    const x = newBuilder(['--help']);
    assert.equal(x.code, 0);
    assert.match(x.out, /--tab-label/);
  });
});

describe('modo --into', () => {
  const t = sandbox();
  after(() => t.rm());

  test('acrescenta a aba, sai com 0 e diz onde ela ficou', () => {
    const spec = t.write('s.xml', SPEC_ALT);
    const out = t.path('d.html');
    assert.equal(newDoc(['T', out, '--tabs', 'A,B']).code, 0);
    const antes = t.read('d.html');
    const r = newBuilder([spec, '--into', out]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /aba "Construtor" \(#pane-pb-entrega\) com o construtor #pb-entrega/);
    const depois = t.read('d.html');
    assert.notEqual(depois, antes);
    assert.match(depois, /<!-- pb:tab:begin pb-entrega -->/);
    assert.match(depois, /<!-- pb:pane:begin pb-entrega -->/);
    assert.match(depois, /<!-- pb:runtime:begin -->/);
    assert.match(depois, /\/\* pb:print:begin/);
  });

  test('documento que não existe: exit 2, e nada é criado', () => {
    const spec = t.path('s.xml');
    const alvo = t.path('nao-existe.html');
    const r = newBuilder([spec, '--into', alvo]);
    assert.equal(r.code, 2);
    assert.match(r.err, /não achei o documento/);
    assert.equal(t.has('nao-existe.html'), false);
  });
});

// ═════════════════════════════════════════════════════ --force e a idempotência ══

describe('--into de novo: --force e a idempotência byte a byte', () => {
  const t = sandbox();
  let spec, out, primeira;

  before(() => {
    spec = t.write('s.xml', SPEC_ALT);
    out = t.path('d.html');
    assert.equal(newDoc(['T', out, '--tabs', 'A,B']).code, 0);
    assert.equal(newBuilder([spec, '--into', out]).code, 0);
    primeira = t.read('d.html');
  });
  after(() => t.rm());

  test('sem --force: recusa, aponta a flag, e o arquivo do disco NÃO é tocado', () => {
    const r = newBuilder([spec, '--into', out]);
    assert.equal(r.code, 1);
    assert.match(r.err, /o documento já traz o construtor #pb-entrega/);
    assert.match(r.err, /--force regera a aba/);
    assert.equal(t.read('d.html'), primeira, 'o documento foi alterado numa rodada que falhou');
  });

  test('com --force: sai com 0 e o resultado é IDÊNTICO ao da primeira rodada', () => {
    const r = newBuilder([spec, '--into', out, '--force']);
    assert.equal(r.code, 0, r.err);
    assert.equal(t.read('d.html'), primeira,
      'o --force não é idempotente: uma segunda rodada muda o arquivo, e o diff acusa um '
      + 'documento que ninguém editou');
  });

  test('--force três vezes seguidas continua no mesmo byte', () => {
    for (let i = 0; i < 3; i++) assert.equal(newBuilder([spec, '--into', out, '--force']).code, 0);
    assert.equal(t.read('d.html'), primeira);
  });

  test('o --force regera o bloco: uma edição feita dentro da aba se perde (e é o combinado)', () => {
    const sujo = t.read('d.html').replace('<h2 class="h4">Monte o prompt da entrega</h2>',
                                          '<h2 class="h4">EDITADO À MÃO</h2>');
    writeFileSync(out, sujo);
    assert.equal(newBuilder([spec, '--into', out, '--force']).code, 0);
    assert.equal(t.read('d.html'), primeira);
  });

  test('dois construtores no mesmo documento, com ids diferentes, e o linter aprova', () => {
    const outro = t.write('outra.xml', specMinima('revisao'));
    assert.equal(newBuilder([outro, '--into', out]).code, 0, 'o segundo construtor tinha de entrar');
    const html = t.read('d.html');
    assert.match(html, /<!-- pb:pane:begin pb-entrega -->/);
    assert.match(html, /<!-- pb:pane:begin pb-revisao -->/);
    assert.equal((html.match(/<!-- pb:runtime:begin -->/g) || []).length, 1,
      'o runtime é um só, mesmo com dois construtores — ele varre todos os .prompt-builder');
    const r = lintFiles(out);
    assert.deepEqual(r.erros, [], r.out);
  });
});

// ═══════════════════════════════════════════════════════ new-doc.mjs --builder ══

describe('new-doc.mjs --builder', () => {
  const t = sandbox();
  after(() => t.rm());

  test('--builder sozinho usa a spec de planejamento padrão', () => {
    const out = t.path('p.html');
    const r = newDoc(['Plano', out, '--tabs', 'A,B', '--builder']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /aba "Construtor" \(#pane-pb-plano\).*spec padrão \(planejamento\)/);
    const html = t.read('p.html');
    assert.match(html, /<!-- pb:pane:begin pb-plano -->/);
    // 2 abas do --tabs + a do construtor.
    assert.equal((html.match(/role="tabpanel"/g) || []).length, 3);
  });

  test('a spec padrão é a mesma da referência, sem o <script> em volta', () => {
    const xml = defaultSpecXml();
    assert.match(xml, /^<prompt-builder\b/);
    assert.match(xml, /<\/prompt-builder>$/);
    assert.ok(readFileSync(resolve(ASSETS, 'prompt-builder.html'), 'utf8').includes(xml),
      'defaultSpecXml() devia ser um recorte literal de assets/prompt-builder.html');
  });

  test('--spec sem --builder também acrescenta a aba', () => {
    const spec = t.write('s.xml', SPEC_ALT);
    const out = t.path('s.html');
    const r = newDoc(['T', out, '--tabs', 'A,B', '--spec', spec]);
    assert.equal(r.code, 0, r.err);
    assert.match(t.read('s.html'), /<!-- pb:pane:begin pb-entrega -->/);
  });

  test('--builder --spec: a mensagem final nomeia o arquivo de spec usado', () => {
    const spec = t.write('s2.xml', SPEC_ALT);
    const out = t.path('s2.html');
    const r = newDoc(['T', out, '--tabs', 'A,B', '--builder', '--spec', spec]);
    assert.equal(r.code, 0, r.err);
    assert.ok(r.out.includes(`spec ${spec}`), r.out);
  });

  test('--spec apontando para arquivo inexistente: exit 2 e o documento NÃO é criado', () => {
    const out = t.path('nunca.html');
    const r = newDoc(['T', out, '--tabs', 'A,B', '--spec', t.path('fantasma.xml')]);
    assert.equal(r.code, 2);
    assert.match(r.err, /não achei a spec/);
    assert.equal(t.has('nunca.html'), false,
      'o documento foi escrito mesmo com a spec faltando — a injeção acontece ANTES do writeFileSync justamente para isso');
  });

  test('spec INVÁLIDA: exit 1, o erro nomeia o problema, e o documento NÃO é criado', () => {
    const spec = t.write('ruim.xml', `<prompt-builder id="x">
  <question type="radio" label="Sem id">
    <option value="a" label="A"/>
  </question>
  <template><![CDATA[{{modo}}]]></template>
</prompt-builder>`);
    const out = t.path('nunca2.html');
    const r = newDoc(['T', out, '--tabs', 'A,B', '--builder', '--spec', spec]);
    assert.equal(r.code, 1, r.err);
    assert.match(r.err, /spec inválida/);
    assert.match(r.err, /<question> sem id/);
    assert.equal(t.has('nunca2.html'), false,
      'a spec foi recusada e o documento foi escrito assim mesmo — é meio documento no disco');
  });

  test('--tab-label também vale no new-doc.mjs', () => {
    const out = t.path('rot.html');
    assert.equal(newDoc(['T', out, '--tabs', 'A,B', '--builder', '--tab-label', 'Planejar']).code, 0);
    assert.match(t.read('rot.html'), /data-print-title="Planejar"/);
  });

  test('sem --builder o documento sai exatamente como sempre saiu', () => {
    const a = t.path('sem1.html');
    assert.equal(newDoc(['T', a, '--tabs', 'A,B']).code, 0);
    const html = t.read('sem1.html');
    assert.equal(html.includes('prompt-builder'), false, 'o construtor vazou para um documento sem --builder');
    assert.equal(html.includes('pb:runtime'), false);
  });
});

// ══════════════════════════════════════════════════ spec inválida: recusa antes ══

describe('validateSpec — o que é recusado, e em que linha', () => {
  test('a raiz precisa ser <prompt-builder>', () => {
    assert.match(erroDeSpec('<builder id="x"><template><![CDATA[x]]></template></builder>'),
      /a raiz da spec é <builder> — precisa ser <prompt-builder>/);
  });

  // A linha 3 aqui só sai certa se o comentário de duas linhas do topo tiver sido CONTADO
  // (e não apenas pulado): é a asserção que mata um `lineOf` que devolva sempre 1.
  test('<prompt-builder> sem id, na linha da raiz — depois de um comentário de duas linhas', () => {
    const msg = erroDeSpec('<!-- um comentário\n     de duas linhas -->\n<prompt-builder>\n'
      + '  <question id="q" type="text" label="Q" default="v"/>\n'
      + '  <template><![CDATA[{{q}}]]></template>\n</prompt-builder>');
    assert.match(msg, /linha 3: <prompt-builder> sem id/);
  });

  test('id de construtor fora de [a-z][a-z0-9-]*', () => {
    assert.match(erroDeSpec(specMinima('Meu Id')), /id="Meu Id" inválido/);
  });

  test('elemento fora do esquema, na linha dele', () => {
    const msg = erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="text" label="Q" default="v"/>
  <fieldset/>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`);
    assert.match(msg, /linha 3: <fieldset> não faz parte do esquema/);
  });

  test('spec sem <template>', () => {
    assert.match(erroDeSpec('<prompt-builder id="x"><question id="q" type="text" label="Q" default="v"/></prompt-builder>'),
      /spec sem <template>/);
  });

  test('dois <template>: a linha apontada é a do SEGUNDO', () => {
    const msg = erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="text" label="Q" default="v"/>
  <template><![CDATA[{{q}}]]></template>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`);
    assert.match(msg, /linha 4: 2 elementos <template> na mesma spec/);
  });

  test('spec sem <question> nenhuma', () => {
    assert.match(erroDeSpec('<prompt-builder id="x"><template><![CDATA[oi]]></template></prompt-builder>'),
      /spec sem nenhuma <question>/);
  });

  test('<question> sem id, na linha da pergunta', () => {
    const msg = erroDeSpec(`<prompt-builder id="x">
  <template><![CDATA[oi]]></template>
  <question type="text" label="Q"/>
</prompt-builder>`);
    assert.match(msg, /linha 3: <question> sem id/);
  });

  test('id de pergunta duplicado nomeia AS DUAS linhas', () => {
    const msg = erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="text" label="Um" default="v"/>
  <question id="outra" type="text" label="Outra" default="v"/>
  <question id="q" type="text" label="Dois" default="v"/>
  <template><![CDATA[{{q}}{{outra}}]]></template>
</prompt-builder>`);
    assert.match(msg, /linha 4: id de pergunta duplicado "q" \(também na linha 2\)/);
  });

  test('id de pergunta fora de [a-z][a-z0-9-]*', () => {
    assert.match(erroDeSpec(`<prompt-builder id="x">
  <question id="Modo" type="text" label="Q" default="v"/>
  <template><![CDATA[oi]]></template>
</prompt-builder>`), /id de pergunta inválido "Modo"/);
  });

  test('type fora dos quatro', () => {
    assert.match(erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="slider" label="Q"/>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`), /pergunta "q" com type="slider" — só existem radio, checkbox, text, textarea/);
  });

  test('pergunta sem label', () => {
    assert.match(erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="text" default="v"/>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`), /pergunta "q" sem label/);
  });

  test('<option> em text/textarea, na linha da PRIMEIRA opção', () => {
    const msg = erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="text" label="Q" default="v">
    <option value="a" label="A"/>
    <option value="b" label="B"/>
  </question>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`);
    assert.match(msg, /linha 3: pergunta "q" é text e tem 2 <option>/);
  });

  test('elemento estranho dentro da pergunta', () => {
    assert.match(erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="radio" label="Q">
    <legend/>
    <option value="a" label="A" default="true"/>
  </question>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`), /linha 3: <legend> dentro da pergunta "q" — só <option> vive aqui/);
  });

  test('join fora dos quatro valores', () => {
    assert.match(erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="checkbox" join="pipe" label="Q">
    <option value="a" label="A"/>
  </question>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`), /join="pipe" na pergunta "q" — os únicos valores são newline, blank-line, comma, space/);
  });

  test('join válido fora de checkbox', () => {
    assert.match(erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="text" join="comma" label="Q" default="v"/>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`), /join="comma" na pergunta "q", que é text — join só vale em checkbox/);
  });

  test('radio/checkbox sem <option>', () => {
    assert.match(erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="checkbox" label="Q"></question>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`), /checkbox "q" sem <option>/);
  });

  test('<option> sem value e sem label', () => {
    const msg = erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="radio" label="Q">
    <option default="true"/>
  </question>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`);
    assert.match(msg, /linha 3: <option> da pergunta "q" sem value/);
    assert.match(msg, /linha 3: <option value=""> da pergunta "q" sem label/);
  });

  test('value repetido nomeia AS DUAS linhas', () => {
    const msg = erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="radio" label="Q">
    <option value="a" label="A" default="true"/>
    <option value="a" label="Outra A"/>
  </question>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`);
    assert.match(msg, /linha 4: value="a" repetido na pergunta "q" \(também na linha 3\)/);
  });

  test('default que não é "true" nem "false"', () => {
    assert.match(erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="radio" label="Q">
    <option value="a" label="A" default="1"/>
    <option value="b" label="B" default="true"/>
  </question>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`), /linha 3: default="1" na opção "a" de "q" — o runtime só marca com a string exata "true"/);
  });

  test('default="false" é aceito calado — é a ausência escrita por extenso', () => {
    const b = buildBlocks(`<prompt-builder id="x">
  <question id="q" type="radio" label="Q">
    <option value="a" label="A" default="false"/>
    <option value="b" label="B" default="true"/>
  </question>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`);
    assert.deepEqual(b.warnings, []);
    assert.equal(b.prompt, 'b');
  });

  test('radio sem nenhum default="true"', () => {
    assert.match(erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="radio" label="Q">
    <option value="a" label="A"/>
  </question>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`), /radio "q" sem nenhuma opção default="true"/);
  });

  test('radio com dois default="true"', () => {
    assert.match(erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="radio" label="Q">
    <option value="a" label="A" default="true"/>
    <option value="b" label="B" default="true"/>
  </question>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`), /radio "q" com 2 opções default="true"/);
  });

  test('{{marcador}} sem pergunta que o atenda', () => {
    assert.match(erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="text" label="Q" default="v"/>
  <template><![CDATA[{{q}} {{fantasma}}]]></template>
</prompt-builder>`), /\{\{fantasma\}\} no <template> não casa com nenhuma pergunta/);
  });

  test('a mensagem junta TODOS os problemas de uma vez, e conta quantos são', () => {
    const msg = erroDeSpec(`<prompt-builder>
  <question type="slider"/>
  <template><![CDATA[{{a}}]]></template>
  <template><![CDATA[x]]></template>
</prompt-builder>`);
    const n = Number(msg.match(/spec inválida — (\d+) problema\(s\)/)[1]);
    assert.ok(n >= 5, `esperava a lista inteira numa mensagem só, vieram ${n}:\n${msg}`);
    assert.equal(msg.split('\n').filter((l) => /^ {2}linha \d+:/.test(l)).length, n,
      'a contagem do cabeçalho não bate com o número de linhas de problema');
  });

  test('"</script" literal na spec é recusado antes de qualquer parse', () => {
    assert.match(erroDeSpec(`<prompt-builder id="x">
  <question id="q" type="radio" label="Q">
    <option value="a" label="A" default="true"><![CDATA[</script>]]></option>
  </question>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`), /"<\/script" literal/);
  });
});

describe('validateSpec — o que é só AVISO', () => {
  test('pergunta declarada e nunca usada no <template>, com a linha dela', () => {
    const w = avisosDe(`<prompt-builder id="x">
  <question id="q" type="text" label="Q" default="v"/>
  <question id="orfa" type="text" label="Órfã" default="v"/>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`);
    assert.deepEqual(w.map((s) => s.trim()),
      ['linha 3: a pergunta "orfa" não aparece no <template> — quem responde escolhe e a escolha não vai para o prompt']);
  });

  test('text/textarea sem placeholder nem default', () => {
    const w = avisosDe(`<prompt-builder id="x">
  <question id="q" type="text" label="Q"/>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`);
    assert.equal(w.length, 1, w.join('\n'));
    assert.match(w[0], /linha 2: pergunta "q" sem placeholder nem default/);
  });

  test('placeholder e default em pergunta de escolha', () => {
    const w = avisosDe(`<prompt-builder id="x">
  <question id="q" type="radio" label="Q" placeholder="p" default="a">
    <option value="a" label="A" default="true"/>
  </question>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`);
    assert.equal(w.length, 2, w.join('\n'));
    assert.match(w[0], /linha 2: placeholder na pergunta "q", que é radio/);
    assert.match(w[1], /linha 2: default na pergunta "q", que é radio/);
  });

  test('mais de 12 perguntas: a linha apontada é a da DÉCIMA TERCEIRA', () => {
    const qs = Array.from({ length: 13 }, (_, i) =>
      `  <question id="q${i}" type="text" label="Q${i}" default="v"/>`).join('\n');
    const tpl = Array.from({ length: 13 }, (_, i) => `{{q${i}}}`).join(' ');
    const w = avisosDe(`<prompt-builder id="x">\n${qs}\n  <template><![CDATA[${tpl}]]></template>\n</prompt-builder>`);
    assert.equal(w.length, 1, w.join('\n'));
    assert.match(w[0], /linha 14: 13 perguntas num construtor só/);
  });

  test('aviso não impede a geração: o bloco sai, e o CLI só o ecoa no stderr', () => {
    const t = sandbox();
    try {
      const spec = t.write('s.xml', `<prompt-builder id="x">
  <question id="q" type="text" label="Q" default="v"/>
  <question id="orfa" type="text" label="Órfã" default="v"/>
  <template><![CDATA[{{q}}]]></template>
</prompt-builder>`);
      const r = newBuilder([spec]);
      assert.equal(r.code, 0, r.err);
      assert.match(r.err, /aviso:\n {2}linha 3: a pergunta "orfa"/);
      assert.match(r.out, /pb:pane:begin pb-x/);
    } finally { t.rm(); }
  });
});

// ══════════════════════════════════════════════════════ parseXml: o XML recusado ══

describe('parseXml — recusa em vez de adivinhar, sempre com a linha', () => {
  const falha = (xml) => {
    try { parseXml(xml); } catch (e) {
      assert.ok(e instanceof PbError, e.stack);
      return e.message;
    }
    assert.fail(`este XML devia ter sido recusado:\n${xml}`);
  };

  test('comentário sem fechamento', () => {
    assert.match(falha('<a>\n<!-- nunca fecho\n</a>'), /linha 2: comentário sem fechamento -->/);
  });

  test('CDATA sem fechamento', () => {
    assert.match(falha('<a>\n<![CDATA[oi\n</a>'), /linha 2: CDATA sem fechamento \]\]>/);
  });

  test('tag de fechamento que não casa nomeia as DUAS linhas', () => {
    assert.match(falha('<a>\n  <b>\n  </c>\n</a>'), /linha 3: <\/c> fecha <b>, aberto na linha 2/);
  });

  test('elemento nunca fechado', () => {
    assert.match(falha('<a>\n  <b>\n'), /<b> aberto na linha 2 nunca foi fechado/);
  });

  test('dois elementos raiz', () => {
    assert.match(falha('<a/>\n<b/>'), /linha 2: <b> é um segundo elemento raiz/);
  });

  test('texto solto fora da raiz', () => {
    assert.match(falha('lixo\n<a/>'), /linha 1: texto solto fora do elemento raiz: "lixo"/);
  });

  test('atributo pelado — o `default` sem valor que o runtime lê como ausente', () => {
    assert.match(falha('<a><b default/></a>'), /linha 1: atributo "default" de <b> sem valor/);
  });

  test('valor de atributo sem aspas', () => {
    assert.match(falha('<a>\n  <b id=x/>\n</a>'), /linha 2: valor de "id" em <b> sem aspas/);
  });

  test('atributo repetido', () => {
    assert.match(falha('<a>\n  <b id="1" id="2"/>\n</a>'), /linha 2: atributo "id" repetido em <b>/);
  });

  test('fechamento sem abertura', () => {
    assert.match(falha('</a>'), /linha 1: <\/a> fecha um elemento que nunca foi aberto/);
  });

  test('spec vazia', () => {
    assert.match(falha('   \n  '), /a spec está vazia/);
  });

  test('o que ele ACEITA: CDATA, comentário, PI, DOCTYPE, aspas simples e ">" no valor', () => {
    const root = parseXml(`<?xml version="1.0"?>
<!DOCTYPE prompt-builder>
<!-- um comentário com <question> dentro -->
<prompt-builder id='x' label="custo > 0">
  <template><![CDATA[<a x="1"/> & <b/>]]></template>
</prompt-builder>`);
    assert.equal(root.tagName, 'prompt-builder');
    assert.equal(root.getAttribute('id'), 'x');
    assert.equal(root.getAttribute('label'), 'custo > 0');
    assert.equal(root.getAttribute('nao-existe'), null);
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0].textContent, '<a x="1"/> & <b/>');
  });

  test('entidades XML no valor de atributo são decodificadas', () => {
    const root = parseXml('<a t="1 &lt; 2 &amp; 3 &gt; 0 &quot;x&quot; &apos;y&apos; &#65;&#x42;"/>');
    assert.equal(root.getAttribute('t'), '1 < 2 & 3 > 0 "x" \'y\' AB');
  });

  test('validateSpec é chamado com a raiz — e a raiz de uma spec válida é o <prompt-builder>', () => {
    const root = parseXml(specMinima());
    assert.deepEqual(validateSpec(root), []);
  });
});

// ══════════════════════════════════ injeção: falha ALTO em vez de escrever pela metade ══

describe('injectInto — o documento alvo precisa ter a forma que a skill produz', () => {
  const t = sandbox();
  let base;
  const blocks = buildBlocks(SPEC_ALT);

  before(() => {
    const out = t.path('base.html');
    assert.equal(newDoc(['T', out, '--tabs', 'A,B']).code, 0);
    base = t.read('base.html');
  });
  after(() => t.rm());

  const recusa = (html, trecho) => {
    try { injectInto(html, blocks); } catch (e) {
      assert.ok(e instanceof PbError, e.stack);
      assert.match(e.message, trecho);
      return e.message;
    }
    assert.fail(`esperava uma recusa contendo ${trecho}`);
  };

  test('o documento do new-doc.mjs é aceito — a linha de base do resto deste bloco', () => {
    assert.notEqual(injectInto(base, blocks), base);
  });

  test('sem o gancho do [data-live]: recusa, e a mensagem traz a linha a aplicar', () => {
    const msg = recusa(base.replace(/if \(code\.closest\('\[data-live\]'\)\) return;.*/, ''),
      /ganchos do §4/);
    assert.match(msg, /sources\.set não pula os blocos vivos/);
    assert.match(msg, /if \(code\.closest\('\[data-live\]'\)\) return;/);
  });

  test('sem o window.__explainerCopy: recusa nomeando o outro gancho', () => {
    const msg = recusa(base.replace(/window\.__explainerCopy\s*=/, 'var naoExposto ='), /ganchos do §4/);
    assert.match(msg, /__explainerCopy não é exposto/);
  });

  test('faltando os DOIS ganchos, a mensagem lista os dois', () => {
    const msg = recusa(base.replace(/if \(code\.closest\('\[data-live\]'\)\) return;.*/, '')
                           .replace(/window\.__explainerCopy\s*=/, 'var naoExposto ='), /ganchos do §4/);
    assert.match(msg, /sources\.set/);
    assert.match(msg, /__explainerCopy/);
  });

  test('sem o <ul id="doc-tabs">: recusa nomeando o ponto de injeção que falta', () => {
    const msg = recusa(base.replace(/ id="doc-tabs" role="tablist"/, ' role="tablist"'),
      /não achei onde encaixar a aba/);
    assert.match(msg, /· nav: esperava <ul class="nav nav-tabs" id="doc-tabs"/);
    assert.equal(msg.includes('· pane:'), false, 'só o ponto que falta devia ser listado');
  });

  test('sem o <div id="doc-tabs-content">: recusa nomeando "pane"', () => {
    assert.match(recusa(base.replace('id="doc-tabs-content"', 'id="outro"'), /não achei onde encaixar/),
      /· pane: esperava/);
  });

  test('faltando nav E pane, os dois são listados na mesma recusa', () => {
    const msg = recusa(base.replace(/ id="doc-tabs" role="tablist"/, ' role="tablist"')
                           .replace('id="doc-tabs-content"', 'id="outro"'), /não achei onde encaixar/);
    assert.match(msg, /· nav:/);
    assert.match(msg, /· pane:/);
  });

  test('sem @media print: recusa — o PDF sairia com o prompt cortado', () => {
    assert.match(recusa(base.replace(/\n {2}@media print \{/, '\n  @media screen {'), /não achei onde encaixar/),
      /· print: esperava um bloco " {2}@media print \{"/);
  });

  test('mas se o CSS de impressão do construtor JÁ está lá, o ponto print deixa de ser exigido', () => {
    const comCss = base.replace(/\n {2}@media print \{/, '\n  /* pb:print:begin já aplicado */\n  @media screen {');
    assert.notEqual(injectInto(comCss, blocks), comCss);
  });

  test('spec num <script> EXECUTÁVEL: recusa, com a linha e o type encontrado', () => {
    const sujo = base.replace('</body>', '<script>\n<prompt-builder id="z"></prompt-builder>\n</script>\n</body>');
    const msg = recusa(sujo, /já existe um <prompt-builder> num <script sem type>/);
    assert.match(msg, /^linha \d+:/);
    assert.match(msg, /o navegador EXECUTA esse bloco/);
  });

  test('spec num <script type="text/xml">: recusa nomeando o type errado', () => {
    const sujo = base.replace('</body>',
      '<script type="text/xml">\n<prompt-builder id="z"></prompt-builder>\n</script>\n</body>');
    assert.match(recusa(sujo, /type="text\/xml"/), /a spec vive em <script type="application\/xml"/);
  });

  test('dois <prompt-builder> no mesmo <script>: recusa', () => {
    const sujo = base.replace('</body>', '<script type="application/xml" id="pb-spec-z">\n'
      + '<prompt-builder id="z"></prompt-builder>\n<prompt-builder id="w"></prompt-builder>\n</script>\n</body>');
    assert.match(recusa(sujo, /há 2 elementos <prompt-builder> no mesmo <script>/), /o DOMParser aceita um só/);
  });

  test('duas cascas para a mesma spec: recusa antes de gerar ids colidentes', () => {
    const sujo = base.replace('</body>', '<div data-pb-spec="pb-spec-z"></div>\n<div data-pb-spec="pb-spec-z"></div>\n</body>');
    assert.match(recusa(sujo, /2 cascas apontam para a mesma spec data-pb-spec="pb-spec-z"/), /os ids gerados colidiriam/);
  });

  test('id já ocupado por outra coisa: recusa nomeando os quatro ids do construtor', () => {
    const sujo = base.replace('</body>', `<div id="${blocks.paneId}"></div>\n</body>`);
    const msg = recusa(sujo, /o documento já usa algum dos ids deste construtor/);
    for (const id of [blocks.shellId, blocks.specId, blocks.paneId, blocks.tabId])
      assert.ok(msg.includes(`#${id}`), `a mensagem não cita #${id}:\n${msg}`);
  });

  test('aba já presente sem o marcador pb:tab: recusa em vez de remover no chute', () => {
    const comAba = injectInto(base, blocks);
    const semMarca = comAba.replace('<!-- pb:tab:begin pb-entrega -->', '<!-- outra coisa -->');
    try {
      injectInto(semMarca, blocks, { force: true });
      assert.fail('devia ter recusado');
    } catch (e) {
      assert.ok(e instanceof PbError, e.stack);
      assert.match(e.message, /está no documento sem o marcador pb:tab — não sei o que remover sem risco/);
    }
  });

  test('injectInto é PURO: recusar não escreve nada, e aceitar não muda a string recebida', () => {
    const copia = String(base);
    injectInto(base, blocks);
    assert.equal(base, copia);
  });
});

describe('--into sobre um documento sem a forma esperada: o arquivo não é tocado', () => {
  const t = sandbox();
  after(() => t.rm());

  test('documento sem os ganchos do §4: exit 1 e o alvo continua byte a byte o mesmo', () => {
    const alvo = t.path('alheio.html');
    const conteudo = '<!doctype html><html><body><p>um HTML qualquer, que não veio da skill</p></body></html>\n';
    writeFileSync(alvo, conteudo);
    const spec = t.write('s.xml', SPEC_ALT);
    const r = newBuilder([spec, '--into', alvo]);
    assert.equal(r.code, 1, r.err);
    assert.match(r.err, /ganchos do §4/);
    assert.equal(t.read('alheio.html'), conteudo, 'o alvo foi alterado numa rodada que falhou');
  });

  test('spec inválida com --into: exit 1 e o alvo continua intacto', () => {
    const alvo = t.path('bom.html');
    assert.equal(newDoc(['T', alvo, '--tabs', 'A,B']).code, 0);
    const antes = t.read('bom.html');
    const spec = t.write('ruim.xml', '<prompt-builder id="x"><template><![CDATA[oi]]></template></prompt-builder>');
    const r = newBuilder([spec, '--into', alvo]);
    assert.equal(r.code, 1, r.err);
    assert.match(r.err, /spec inválida/);
    assert.equal(t.read('bom.html'), antes, 'o alvo foi alterado por uma spec que nem passou na validação');
  });

  test('XML malformado com --into: exit 1, mensagem sem stack, alvo intacto', () => {
    const alvo = t.path('bom2.html');
    assert.equal(newDoc(['T', alvo, '--tabs', 'A,B']).code, 0);
    const antes = t.read('bom2.html');
    const spec = t.write('quebrado.xml', '<prompt-builder id="x">\n  <question id="q">\n</prompt-builder>');
    const r = newBuilder([spec, '--into', alvo]);
    assert.equal(r.code, 1, r.err);
    assert.equal(r.err.includes('at Object.'), false, `a mensagem de erro de input não pode trazer stack:\n${r.err}`);
    assert.equal(t.read('bom2.html'), antes);
  });
});

// ════════════════════════════════════════════════ o script chamado por um SYMLINK ══
//
// O install.sh instala a skill como symlink do DIRETÓRIO html-explainer/ inteiro. O loader
// ESM resolve symlink antes de formar import.meta.url; `resolve()` não resolve. Pelo caminho
// do link os dois lados nunca batiam, `main()` não rodava, e o script saía 0 MUDO — o
// `--example > spec.xml` do próprio README criava um arquivo VAZIO, sem nenhum aviso.

describe('invocado por um symlink (é assim que o install.sh instala a skill)', () => {
  const t = sandbox('html-explainer-symlink-');
  after(() => t.rm());

  before(() => symlinkSync(resolve(ROOT, 'html-explainer'), t.path('skill-link'), 'dir'));

  test('symlink do DIRETÓRIO da skill: --example continua escrevendo a spec inteira', () => {
    const viaLink = run(join(t.path('skill-link'), 'scripts', 'new-builder.mjs'), ['--example']);
    assert.equal(viaLink.code, 0, viaLink.err);
    assert.equal(viaLink.out, EXAMPLE_SPEC,
      'chamado pelo symlink o script saiu MUDO — a guarda de entrada voltou a usar resolve(), '
      + 'que não resolve symlink: main() não roda, o processo sai 0 sem dizer nada, e o '
      + '`--example > spec.xml` do README cria um arquivo VAZIO');
  });

  test('symlink do ARQUIVO do script: idem', () => {
    const link = t.path('nb-link.mjs');
    symlinkSync(NEW_BUILDER, link, 'file');
    const x = run(link, ['--example']);
    assert.equal(x.code, 0, x.err);
    assert.equal(x.out, EXAMPLE_SPEC);
  });

  test('pelo symlink o uso errado também continua saindo com 2 — a guarda não engoliu argv', () => {
    const x = run(join(t.path('skill-link'), 'scripts', 'new-builder.mjs'), []);
    assert.equal(x.code, 2);
    assert.match(x.err, /uso:/);
  });

  test('pelo symlink do diretório o --into funciona de ponta a ponta', () => {
    const bin = join(t.path('skill-link'), 'scripts');
    const alvo = t.path('d.html');
    assert.equal(run(join(bin, 'new-doc.mjs'), ['T', alvo, '--tabs', 'A,B']).code, 0);
    const spec = t.write('s.xml', SPEC_ALT);
    const r = run(join(bin, 'new-builder.mjs'), [spec, '--into', alvo]);
    assert.equal(r.code, 0, r.err);
    assert.match(t.read('d.html'), /<!-- pb:pane:begin pb-entrega -->/);
  });

  test('importado como módulo, o CLI NÃO dispara — é o que o new-doc.mjs depende', () => {
    // Se `main()` rodasse no import, importar new-builder.mjs sem argumentos sairia com 2 e
    // derrubaria este processo de teste. Chegar aqui já é a asserção; a explícita é o uso do
    // export, que só existe porque o módulo carregou inteiro sem executar o CLI.
    assert.equal(typeof buildBlocks, 'function');
    assert.equal(typeof injectInto, 'function');
    assert.ok(EXAMPLE_SPEC.length > 0);
  });
});

// ═════════════════════════════════════════ lacuna conhecida (NÃO consertada aqui) ══
//
// Achada ao escrever esta suíte, e deixada de propósito sem conserto: este sub-agente só
// escreve teste. Fica como `todo` para não derrubar a suíte e não sumir da vista.

describe('lacunas conhecidas do gerador', () => {
  test('o stdout do modo "blocos" é TRUNCADO quando o leitor não drena antes do exit — new-builder.mjs:769',
    { todo: 'bug de produção: process.exit() logo depois de um process.stdout.write() grande' }, () => {
      // `process.stdout.write()` num CANO é assíncrono; `process.exit()` na linha seguinte
      // descarta o que ainda não saiu. Redirecionando para arquivo saem os ~24 KB inteiros;
      // por cano chegam ~7,7 KB — o bloco do runtime cortado no meio de uma função. Quem
      // captura a saída de dentro de um script (CI, outro agente) cola um runtime quebrado.
      const t = sandbox();
      try {
        const spec = t.write('s.xml', SPEC_ALT);
        const arquivo = run(NEW_BUILDER, [spec]);          // stdout -> arquivo
        const cano = runPipe(NEW_BUILDER, [spec]);         // stdout -> cano
        assert.equal(cano.out.length, arquivo.out.length,
          `pelo cano vieram ${cano.out.length} bytes dos ${arquivo.out.length} que o arquivo recebeu`);
      } finally { t.rm(); }
    });
});
