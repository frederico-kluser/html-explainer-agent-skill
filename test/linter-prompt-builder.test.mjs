/**
 * Regressão do `promptBuilder()` do check-doc.mjs contra o §6 do contrato.
 *
 * Cada teste de erro/aviso monta o documento MÍNIMO que dispara aquela checagem, e a
 * asserção é sempre sobre o TRECHO da mensagem — nunca sobre a contagem total de
 * problemas do arquivo. Contagem total quebra sempre que uma checagem nova entra; o
 * trecho só quebra quando a checagem que o teste cobre realmente mudou.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lintHtml } from './helpers/lint.mjs';
import { doc, docComConstrutor, spec, shell, promptBuilderXml, SAIDA_PADRAO, HOOKS } from './fixtures/doc.mjs';

/** Spec com o miolo do <prompt-builder> montado a partir das perguntas dadas. */
const specDe = (perguntas, template, attrs) => spec({ body: promptBuilderXml(perguntas, template, attrs) });

/** Documento com a spec trocada e a casca canônica. */
const comSpec = (perguntas, template, attrs) =>
  doc(`${specDe(perguntas, template, attrs)}\n${shell()}\n${HOOKS}`, { hooks: false });

const RADIO_OK = `<question id="modo" type="radio" label="Modo">
    <option value="a" label="Alfa" default="true"><![CDATA[<a/>]]></option>
    <option value="b" label="Beta"><![CDATA[<b/>]]></option>
  </question>`;

const TPL = '<template><![CDATA[\n<root>\n  {{modo}}\n</root>\n]]></template>';
const TPL_VAZIO = '<template><![CDATA[\n<root/>\n]]></template>';

/** Falha com a saída inteira do linter em anexo — sem isso, depurar é adivinhar. */
function assertErro(r, trecho) {
  assert.ok(r.tem('erro', trecho), `esperava um ERRO contendo ${JSON.stringify(trecho)}.\n${r.out}`);
  assert.equal(r.code, 1, `documento com erro tem de sair com 1.\n${r.out}`);
}

function assertAviso(r, trecho) {
  assert.ok(r.tem('aviso', trecho), `esperava um AVISO contendo ${JSON.stringify(trecho)}.\n${r.out}`);
  assert.equal(r.erros.length, 0, `o fixture do aviso não devia ter erro nenhum.\n${r.out}`);
  assert.equal(r.code, 0, `documento só com aviso tem de sair com 0.\n${r.out}`);
}

function assertLimpo(r) {
  assert.deepEqual({ erros: r.erros, avisos: r.avisos }, { erros: [], avisos: [] },
    `este fixture tinha de passar limpo.\n${r.out}`);
  assert.equal(r.code, 0);
}

// ─────────────────────────────────────────────────────────────── erros do §6 ──

describe('§6 erros — casca e spec', () => {
  test('[data-pb-output] fora de um <pre data-live>', () => {
    const r = lintHtml(docComConstrutor({
      shellOpts: { saida: `<pre><code class="language-xml" data-pb-output>${SAIDA_PADRAO}</code></pre>` },
    }));
    assertErro(r, 'fora de um <pre data-live>');
  });

  test('casca sem [data-pb-form]', () => {
    const r = lintHtml(docComConstrutor({ shellOpts: { form: '' } }));
    assertErro(r, 'sem [data-pb-form]');
  });

  test('casca sem [data-pb-copy]', () => {
    const r = lintHtml(docComConstrutor({ shellOpts: { copy: '' } }));
    assertErro(r, 'sem [data-pb-copy]');
  });

  test('casca sem [data-pb-output]', () => {
    const r = lintHtml(docComConstrutor({ shellOpts: { saida: '' } }));
    assertErro(r, 'sem [data-pb-output]');
  });

  test('spec sem casca que a referencie', () => {
    const r = lintHtml(doc(`${spec()}\n${HOOKS}`, { hooks: false }));
    assertErro(r, 'não é referenciada por nenhuma casca');
  });

  test('spec sem id no <script> — nenhuma casca consegue apontar para ela', () => {
    const r = lintHtml(doc(`${spec({ scriptId: null })}\n${HOOKS}`, { hooks: false }));
    assertErro(r, 'spec do construtor sem id no <script>');
  });

  test('casca sem data-pb-spec', () => {
    const r = lintHtml(doc(`${shell({ spec: null })}\n${HOOKS}`, { hooks: false }));
    assertErro(r, 'sem data-pb-spec');
  });

  test('data-pb-spec apontando para spec inexistente', () => {
    const r = lintHtml(docComConstrutor({ shellOpts: { spec: 'pb-spec-fantasma' } }));
    assertErro(r, 'não aponta para nenhuma spec');
  });
});

describe('§6 erros — perguntas', () => {
  test('<question> sem id', () => {
    const r = lintHtml(comSpec('<question type="text" label="Alvo"/>', TPL_VAZIO));
    assertErro(r, '<question> sem id');
  });

  test('id de pergunta fora de [a-z][a-z0-9-]*', () => {
    const r = lintHtml(comSpec('<question id="Modo" type="text" label="Alvo"/>', TPL_VAZIO));
    assertErro(r, 'id de pergunta inválido "Modo"');
  });

  test('id de pergunta duplicado', () => {
    const r = lintHtml(comSpec(
      '<question id="modo" type="text" label="Um"/>\n  <question id="modo" type="text" label="Dois"/>', TPL));
    assertErro(r, 'id de pergunta duplicado "modo"');
  });

  test('type fora dos quatro', () => {
    const r = lintHtml(comSpec('<question id="modo" type="slider" label="Alvo"/>', TPL));
    assertErro(r, 'só existem radio, checkbox, text e textarea');
  });

  test('radio sem nenhuma opção default="true"', () => {
    const r = lintHtml(comSpec(`<question id="modo" type="radio" label="Modo">
    <option value="a" label="Alfa"><![CDATA[<a/>]]></option>
    <option value="b" label="Beta"><![CDATA[<b/>]]></option>
  </question>`, TPL));
    assertErro(r, 'sem nenhuma opção default="true"');
  });

  test('radio com mais de um default="true"', () => {
    const r = lintHtml(comSpec(`<question id="modo" type="radio" label="Modo">
    <option value="a" label="Alfa" default="true"><![CDATA[<a/>]]></option>
    <option value="b" label="Beta" default="true"><![CDATA[<b/>]]></option>
  </question>`, TPL));
    assertErro(r, 'opções default="true" — o runtime fica com a primeira');
  });

  test('radio sem <option>', () => {
    const r = lintHtml(comSpec('<question id="modo" type="radio" label="Modo"></question>', TPL));
    assertErro(r, 'sem <option>');
  });

  test('checkbox sem <option>', () => {
    const r = lintHtml(comSpec('<question id="modo" type="checkbox" label="Modo"></question>', TPL));
    assertErro(r, 'sem <option>');
  });

  test('<option> sem value', () => {
    const r = lintHtml(comSpec(`<question id="modo" type="radio" label="Modo">
    <option label="Alfa" default="true"><![CDATA[<a/>]]></option>
  </question>`, TPL));
    assertErro(r, 'sem value');
  });

  test('<option> sem label', () => {
    const r = lintHtml(comSpec(`<question id="modo" type="radio" label="Modo">
    <option value="a" default="true"><![CDATA[<a/>]]></option>
  </question>`, TPL));
    assertErro(r, 'sem label');
  });

  test('<option default="1"> — o runtime só aceita a string "true"', () => {
    const r = lintHtml(comSpec(`<question id="modo" type="radio" label="Modo">
    <option value="a" label="Alfa" default="1"><![CDATA[<a/>]]></option>
    <option value="b" label="Beta" default="true"><![CDATA[<b/>]]></option>
  </question>`, TPL));
    assertErro(r, 'exatamente a string "true"');
  });
});

describe('§6 erros — template', () => {
  test('spec sem <template>', () => {
    const r = lintHtml(comSpec(RADIO_OK, ''));
    assertErro(r, 'sem <template>');
  });

  test('dois <template> na mesma spec', () => {
    const r = lintHtml(comSpec(RADIO_OK, `${TPL}\n  ${TPL}`));
    assertErro(r, 'elementos <template> na mesma spec');
  });

  test('{{x}} sem pergunta x', () => {
    const r = lintHtml(comSpec(RADIO_OK,
      '<template><![CDATA[\n<root>\n  {{modo}}\n  {{nao-existe}}\n</root>\n]]></template>'));
    assertErro(r, '{{nao-existe}} no <template> não casa com nenhuma pergunta');
  });
});

// ────────────────────────────────────────────────────────────── avisos do §6 ──

describe('§6 avisos', () => {
  test('pergunta declarada e nunca usada no <template>', () => {
    const r = lintHtml(comSpec(`${RADIO_OK}
  <question id="orfa" type="text" label="Nunca usada" default="x"/>`, TPL));
    assertAviso(r, 'a pergunta "orfa" não aparece no <template>');
  });

  test('casca sem [data-pb-status][aria-live]', () => {
    const r = lintHtml(docComConstrutor({ shellOpts: { status: '' } }));
    assertAviso(r, 'sem [data-pb-status][aria-live]');
  });

  test('[data-pb-status] sem aria-live', () => {
    const r = lintHtml(docComConstrutor({ shellOpts: { status: '<span data-pb-status>prompt padrao</span>' } }));
    assertAviso(r, '[data-pb-status] sem aria-live="polite"');
  });

  test('casca sem [data-pb-reset]', () => {
    const r = lintHtml(docComConstrutor({ shellOpts: { reset: '' } }));
    assertAviso(r, 'sem [data-pb-reset]');
  });

  test('casca sem <noscript>', () => {
    const r = lintHtml(docComConstrutor({ shellOpts: { form: '<div data-pb-form></div>' } }));
    assertAviso(r, 'sem <noscript>');
  });

  test('mais de 12 perguntas num construtor', () => {
    const n = 13;
    const perguntas = Array.from({ length: n }, (_, i) =>
      `<question id="q${i}" type="text" label="Pergunta ${i}" default="v${i}"/>`).join('\n  ');
    const linhas = Array.from({ length: n }, (_, i) => `  {{q${i}}}`).join('\n');
    const r = lintHtml(comSpec(perguntas, `<template><![CDATA[\n<root>\n${linhas}\n</root>\n]]></template>`));
    assertAviso(r, `${n} perguntas num construtor só`);
  });
});

// ─────────────────────────────────── fixtures válidos: as armadilhas do parser ──

describe('válidos — o linter não pode inventar problema', () => {
  test('documento base, com construtor canônico', () => {
    assertLimpo(lintHtml(docComConstrutor()));
  });

  test('documento sem construtor nenhum', () => {
    assertLimpo(lintHtml(doc('<p>Um documento comum, sem construtor.</p>', { hooks: false })));
  });

  test('<question/> auto-fechada', () => {
    assertLimpo(lintHtml(comSpec('<question id="modo" type="text" label="Alvo" default="v"/>', TPL)));
  });

  test('atributos em ordem trocada', () => {
    assertLimpo(lintHtml(comSpec(`<question label="Modo" type="radio" id="modo">
    <option default="true" label="Alfa" value="a"><![CDATA[<a/>]]></option>
    <option label="Beta" value="b"><![CDATA[<b/>]]></option>
  </question>`, TPL)));
  });

  test('atributos quebrados em várias linhas', () => {
    assertLimpo(lintHtml(comSpec(`<question id="modo"
            type="radio"
            label="Modo"
            help="Escolha um">
    <option value="a"
            label="Alfa"
            default="true"><![CDATA[<a/>]]></option>
    <option value="b"
            label="Beta"><![CDATA[<b/>]]></option>
  </question>`, TPL)));
  });

  test('aspas simples na spec E na casca', () => {
    const s = `<script type='application/xml' id='pb-spec-x'>
<prompt-builder id='x' lang='xml'>
  <question id='modo' type='radio' label='Modo'>
    <option value='a' label='Alfa' default='true'><![CDATA[<a/>]]></option>
    <option value='b' label='Beta'><![CDATA[<b/>]]></option>
  </question>
  ${TPL}
</prompt-builder>
</script>`;
    const casca = `<div class='prompt-builder' id='pb-x' data-pb-spec='pb-spec-x'>
  <div data-pb-form><noscript>sem js</noscript></div>
  <button type='button' data-pb-copy>Copiar</button>
  <button type='button' data-pb-reset>Restaurar</button>
  <span data-pb-status aria-live='polite'>ok</span>
  <pre data-live><code class='language-xml' data-pb-output>${SAIDA_PADRAO}</code></pre>
</div>`;
    assertLimpo(lintHtml(doc(`${s}\n${casca}\n${HOOKS}`, { hooks: false })));
  });

  test('comentário XML dentro da spec', () => {
    assertLimpo(lintHtml(comSpec(`<!-- a pergunta que decide o resto -->
  ${RADIO_OK}`, TPL)));
  });

  test('<option> de corpo vazio (o fragmento passa a ser o próprio value)', () => {
    assertLimpo(lintHtml(comSpec(`<question id="modo" type="radio" label="Modo">
    <option value="a" label="Alfa" default="true"></option>
    <option value="b" label="Beta"></option>
  </question>`, TPL)));
  });

  test('<option/> auto-fechada', () => {
    assertLimpo(lintHtml(comSpec(`<question id="modo" type="radio" label="Modo">
    <option value="a" label="Alfa" default="true"/>
    <option value="b" label="Beta"/>
  </question>`, TPL)));
  });

  test('CDATA contendo </question> e <option> — não vira opção fantasma', () => {
    assertLimpo(lintHtml(comSpec(`<question id="modo" type="radio" label="Modo">
    <option value="a" label="Alfa" default="true"><![CDATA[<exemplo>
</question>
<option value="fantasma" label="nao existe"/>
</exemplo>]]></option>
    <option value="b" label="Beta"><![CDATA[<b/>]]></option>
  </question>`, TPL)));
  });

  test('<template> e {{nao-existe}} literais em bloco de código e em prosa', () => {
    const prosa = `<p>O esqueleto vai em <code>&lt;template&gt;</code>, e um marcador órfão como
       {{nao-existe}} sai literal no prompt.</p>
<pre><code class="language-html">&lt;template&gt;&lt;![CDATA[
  {{nao-existe}}
]]&gt;&lt;/template&gt;</code></pre>`;
    assertLimpo(lintHtml(docComConstrutor({ antes: prosa })));
  });

  test('dois construtores no mesmo documento (specs e ids distintos)', () => {
    const a = `${spec({ id: 'um', scriptId: 'pb-spec-um' })}\n${shell({ id: 'pb-um', spec: 'pb-spec-um' })}`;
    const b = `${spec({ id: 'dois', scriptId: 'pb-spec-dois' })}\n${shell({ id: 'pb-dois', spec: 'pb-spec-dois' })}`;
    assertLimpo(lintHtml(doc(`${a}\n${b}\n${HOOKS}`, { hooks: false })));
  });

  test('casca em <section> em vez de <div>', () => {
    assertLimpo(lintHtml(docComConstrutor({ shellOpts: { tag: 'section' } })));
  });

  test('casca dentro de aba aninhada', () => {
    const dentro = `<div class="tab-content">
  <div class="tab-pane fade show active" id="pane-c" role="tabpanel" aria-labelledby="tab-c" tabindex="0">
    <div class="row">
      <div class="col">
${shell()}
      </div>
    </div>
  </div>
</div>`;
    assertLimpo(lintHtml(doc(`${spec()}\n${dentro}\n${HOOKS}`, { hooks: false })));
  });

  test('<DIV CLASS=...> em maiúsculas', () => {
    const casca = shell().replace('<div class="prompt-builder"', '<DIV CLASS="prompt-builder"').replace(/<\/div>$/, '</DIV>');
    assertLimpo(lintHtml(doc(`${spec()}\n${casca}\n${HOOKS}`, { hooks: false })));
  });

  test('espaços em volta do = nos atributos', () => {
    const casca = `<div class = "prompt-builder" id = "pb-x" data-pb-spec = "pb-spec-x">
  <div data-pb-form><noscript>sem js</noscript></div>
  <button type="button" data-pb-copy>Copiar</button>
  <button type="button" data-pb-reset>Restaurar</button>
  <span data-pb-status aria-live = "polite">ok</span>
  <pre data-live><code class = "language-xml" data-pb-output>${SAIDA_PADRAO}</code></pre>
</div>`;
    assertLimpo(lintHtml(doc(`${spec()}\n${casca}\n${HOOKS}`, { hooks: false })));
  });

  test('">" dentro de help e de label', () => {
    assertLimpo(lintHtml(comSpec(`<question id="modo" type="radio"
            label="Custo > 0 ?"
            help="marque quando o custo > 0 e a margem > 10%">
    <option value="a" label="Sim, custo > 0" default="true"><![CDATA[<a/>]]></option>
    <option value="b" label="Nao (custo <= 0)"><![CDATA[<b/>]]></option>
  </question>`, TPL)));
  });

  test('class="prompt-builder-legend" NÃO é uma casca', () => {
    const decoro = '<div class="prompt-builder-legend">Um auxiliar decorativo, sem gancho nenhum.</div>';
    assertLimpo(lintHtml(doc(decoro, { hooks: false })));
  });

  test('prosa dentro da casca citando data-pb-form não substitui o atributo', () => {
    const prosa = '<p>O runtime injeta os fieldsets em data-pb-form e escreve em data-pb-output.</p>';
    const r = lintHtml(docComConstrutor({ shellOpts: { form: prosa } }));
    assertErro(r, 'sem [data-pb-form]');
  });

  test('prosa citando data-pb-output não faz as vezes do <code> de saída', () => {
    const r = lintHtml(docComConstrutor({
      shellOpts: { saida: '<p>a saída sai no elemento com data-pb-output</p>' },
    }));
    assertErro(r, 'sem [data-pb-output]');
  });
});

// ─────────────────────────────────────────────── o rigor que a Onda 2 apertou ──
//
// Estas oito checagens nasceram como `todo` — a Onda 2 (`onda2-linter-rigor`) prometia
// reprovar o que o linter então aceitava calado. A Onda 2 entrou, e elas são testes de
// verdade. O único fixture que sumiu daqui é o irmão do primeiro, que afirmava o estado
// ANTIGO (`<script type="text/xml">` passando limpo): ele existia para documentar o que
// seria quebrado de propósito, e manter os dois seria afirmar as duas coisas ao mesmo tempo.

describe('§6 rigor — o que a Onda 2 promoveu a erro', () => {
  test('spec fora de type="application/xml" é ERRO', () => {
    const r = lintHtml(docComConstrutor({ specOpts: { tipo: 'text/xml' } }));
    assertErro(r, 'application/xml');
  });

  test('<prompt-builder> sem id é ERRO', () => {
    const r = lintHtml(comSpec(RADIO_OK, TPL, 'lang="xml"'));
    assertErro(r, 'sem id');
  });

  test('<option> dentro de text/textarea é ERRO', () => {
    const r = lintHtml(comSpec(`<question id="modo" type="text" label="Alvo">
    <option value="a" label="Alfa"/>
  </question>`, TPL));
    assertErro(r, 'option');
  });

  test('join fora dos quatro valores é ERRO', () => {
    const r = lintHtml(comSpec(`<question id="modo" type="checkbox" join="pipe" label="Modo">
    <option value="a" label="Alfa" default="true"><![CDATA[<a/>]]></option>
  </question>`, TPL));
    assertErro(r, 'join');
  });

  // O contrato define este caso como AVISO, não erro: `join` só serve para unir os
  // fragmentos de VÁRIAS opções marcadas, então fora de checkbox ele é inofensivo — o
  // runtime lê o atributo e nunca o usa. O que ele denuncia é um `type` errado, e isso é
  // suspeita, não defeito. O linter faz um `else if`: valor inválido emite SÓ o erro, e o
  // aviso de "fora de checkbox" só é avaliado quando o valor é válido.
  test('join válido em pergunta que não é checkbox é AVISO, não erro', () => {
    const r = lintHtml(comSpec('<question id="modo" type="text" join="comma" label="Alvo" default="v"/>', TPL));
    assertAviso(r, 'join="comma" na pergunta "modo", que é text');
  });

  test('join INVÁLIDO fora de checkbox emite só o erro do valor — o aviso não é avaliado', () => {
    const r = lintHtml(comSpec('<question id="modo" type="text" join="pipe" label="Alvo" default="v"/>', TPL));
    assertErro(r, 'join="pipe"');
    assert.ok(!r.tem('aviso', 'só serve para unir os fragmentos'),
      `o else-if do linter não devia emitir também o aviso de "fora de checkbox".\n${r.out}`);
  });

  test('documento com construtor e sem os ganchos do §4 é ERRO', () => {
    const r = lintHtml(doc(`${spec()}\n${shell()}`, { hooks: false }));
    assertErro(r, 'data-live');
  });

  test('duas cascas para a mesma spec é ERRO', () => {
    const duas = `${shell({ id: 'pb-x' })}\n${shell({ id: 'pb-x2' })}`;
    const r = lintHtml(doc(`${spec()}\n${duas}\n${HOOKS}`, { hooks: false }));
    assertErro(r, 'casca');
  });

  test('dois <prompt-builder> no mesmo <script> é ERRO', () => {
    const corpo = `${promptBuilderXml(RADIO_OK, TPL, 'id="x"')}\n${promptBuilderXml(RADIO_OK, TPL, 'id="y"')}`;
    const r = lintHtml(doc(`${spec({ body: corpo })}\n${shell()}\n${HOOKS}`, { hooks: false }));
    assertErro(r, 'prompt-builder');
  });
});

// ──────────────────────────────── comentário XML na spec: o falso positivo caro ──
//
// Comentar uma spec é justamente escrever «escolha a <question> e a <option> certas» — e
// antes da Onda 2 essa frase virava uma PERGUNTA FANTASMA, sem id e sem type, que reprovava
// um documento perfeito. O conserto não é um `replace` a mais: comentário e CDATA não se
// aninham e quem ABRE PRIMEIRO manda, então os dois `replace` em sequência têm caso-veneno
// nas DUAS ordens — `<!-- ]]> -->` é um comentário inteiro, e `<![CDATA[ <!-- ]]>` é um
// CDATA cujo `<!--` é texto. Os dois venenos estão aqui embaixo, um para cada ordem.

describe('§6 comentário XML — nada de pergunta fantasma', () => {
  test('comentário citando <question>/<option> ANTES da raiz', () => {
    const corpo = `<!-- escolha a <question> e a <option> certas antes de publicar -->
${promptBuilderXml(RADIO_OK, TPL)}`;
    assertLimpo(lintHtml(doc(`${spec({ body: corpo })}\n${shell()}\n${HOOKS}`, { hooks: false })));
  });

  test('comentário citando <question>/<option> DENTRO da raiz, antes da pergunta', () => {
    assertLimpo(lintHtml(comSpec(`<!-- uma <question type="radio"> por decisão; a <option id="fantasma"/>
       abaixo é só ilustração e não existe -->
  ${RADIO_OK}`, TPL)));
  });

  test('comentário DENTRO de <question>, entre as <option>', () => {
    assertLimpo(lintHtml(comSpec(`<question id="modo" type="radio" label="Modo">
    <!-- a <option value="alfa"> é o padrão; não acrescente uma <question> aqui -->
    <option value="a" label="Alfa" default="true"><![CDATA[<a/>]]></option>
    <!-- <option value="gama" label="Gama"/> — desativada, ainda não vale -->
    <option value="b" label="Beta"><![CDATA[<b/>]]></option>
  </question>`, TPL)));
  });

  test('comentário citando {{marcador}} inexistente não vira marcador fantasma', () => {
    assertLimpo(lintHtml(comSpec(`<!-- um dia teremos {{nao-existe}} e {{tambem-nao}} aqui -->
  ${RADIO_OK}`, TPL)));
  });

  test('comentário citando <template> não conta como segundo <template>', () => {
    assertLimpo(lintHtml(comSpec(`${RADIO_OK}
  <!-- o <template> abaixo é o único; um segundo <template> quebraria o build -->`, TPL)));
  });

  test('comentário citando <prompt-builder> não conta como segunda raiz', () => {
    const corpo = `<!-- um <prompt-builder> por <script>: XML só admite um elemento raiz -->
${promptBuilderXml(RADIO_OK, TPL)}`;
    assertLimpo(lintHtml(doc(`${spec({ body: corpo })}\n${shell()}\n${HOOKS}`, { hooks: false })));
  });

  test('comentário DENTRO de um CDATA continua valendo como texto do fragmento', () => {
    assertLimpo(lintHtml(comSpec(`<question id="modo" type="radio" label="Modo">
    <option value="a" label="Alfa" default="true"><![CDATA[<a>
  <!-- este comentário sai no prompt, é conteúdo do fragmento -->
</a>]]></option>
    <option value="b" label="Beta"><![CDATA[<b/>]]></option>
  </question>`, TPL)));
  });

  // Veneno da ordem «comentário primeiro»: quem apagasse comentários antes dos CDATA veria
  // um `<!--` sem `-->` e engoliria o resto da spec (ou acusaria comentário não fechado).
  // Na varredura linear o CDATA abre primeiro, e o `<!--` de dentro é texto.
  test('<![CDATA[ contendo <!-- sem fechar — o marcador é texto, não abre comentário', () => {
    assertLimpo(lintHtml(comSpec(`<question id="modo" type="radio" label="Modo">
    <option value="a" label="Alfa" default="true"><![CDATA[<a>ensine a escrever <!-- assim</a>]]></option>
    <option value="b" label="Beta"><![CDATA[<b/>]]></option>
  </question>`, TPL)));
  });

  // Veneno da ordem inversa: quem apagasse CDATA primeiro comeria o `<![CDATA[ … ]]>` de
  // dentro do comentário e deixaria um `<!--` órfão. Aqui o comentário abre primeiro e vai
  // inteiro até o `-->`, com o `<question>` de dentro sem virar pergunta nenhuma.
  test('<!-- contendo <![CDATA[ — o comentário manda, do <!-- até o -->', () => {
    assertLimpo(lintHtml(comSpec(`<!-- exemplo do formato:
       <question id="fantasma" type="radio" label="Nao existe">
         <option value="z" label="Zeta"><![CDATA[<z/>]]></option>
       </question> -->
  ${RADIO_OK}`, TPL)));
  });

  test('comentário não fechado é um ERRO próprio, que nomeia a causa', () => {
    const r = lintHtml(comSpec(`<!-- esqueci de fechar este comentário
  ${RADIO_OK}`, TPL));
    assertErro(r, 'comentário XML aberto com <!-- e nunca fechado');
  });

  // O comentário aberto engole o resto da spec em branco, e as checagens seguintes rodam
  // sobre esse branco: o SINTOMA ("spec sem <template>") sai junto com a CAUSA. O ganho da
  // Onda 2 é a causa estar lá e nomeada — antes só havia o sintoma, e quem lesse o relatório
  // ia procurar um <template> que estava escrito na cara dele. Fixado aqui em vez de exigir
  // que o sintoma seja suprimido, porque é o que o linter faz hoje; ver o handoff.
  test('comentário não fechado: a causa sai NOMEADA, ao lado do sintoma que ela produz', () => {
    const r = lintHtml(comSpec(`<!-- esqueci de fechar este comentário
  ${RADIO_OK}`, TPL));
    assert.ok(r.tem('erro', 'comentário XML aberto com <!-- e nunca fechado'),
      `a causa tem de ser nomeada.\n${r.out}`);
    assert.ok(r.tem('erro', 'sem <template>'),
      `hoje o sintoma vem junto — se ele sumiu, o linter melhorou e este teste é que está velho.\n${r.out}`);
    assert.equal(r.code, 1, r.out);
  });
});
