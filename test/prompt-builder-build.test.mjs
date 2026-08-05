/**
 * A camada pura do construtor: `dedent`, `fragment`, `defaults` e `build`.
 *
 * Ela é o coração do §2 do contrato e não toca no DOM — roda em Node sem navegador, direto
 * do arquivo de referência. O último teste do arquivo é o mais importante de todos: ele
 * compara o `<code data-pb-output>` já preenchido no HTML com o que o runtime monta na
 * combinação padrão. Se os dois divergirem, o documento mente para quem lê sem JavaScript
 * ou imprime em PDF — e ninguém percebe, porque com JS a tela se corrige no `load`.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadPromptBuilder, specSource, outputSource, BUILDER_HTML } from './helpers/pb.mjs';
import { parseXml } from './helpers/mini-xml.mjs';

const PB = loadPromptBuilder();

/** Modelo a partir de um miolo de <prompt-builder>, sem navegador. */
function modelo(xml) {
  return PB.model(parseXml(xml));
}

const RADIO = {
  type: 'radio',
  id: 'r',
  options: [
    { value: 'a', label: 'A', fragment: '<a/>', checked: false },
    { value: 'b', label: 'B', fragment: '<b/>', checked: true },
  ],
};

const CHECK = (join) => ({
  type: 'checkbox',
  id: 'c',
  join,
  options: [
    { value: 'um', label: '1', fragment: '<um/>', checked: false },
    { value: 'dois', label: '2', fragment: '<dois/>', checked: false },
    { value: 'tres', label: '3', fragment: '<tres/>', checked: false },
  ],
});

// ────────────────────────────────────────────────────────────────── dedent ──

describe('dedent', () => {
  test('tira as linhas em branco das pontas e a indentação comum', () => {
    assert.equal(PB.dedent('\n\n    <a>\n      <b/>\n    </a>\n\n'), '<a>\n  <b/>\n</a>');
  });

  test('linha vazia no meio não conta na medição e sai vazia', () => {
    assert.equal(PB.dedent('    um\n\n    dois'), 'um\n\ndois');
  });

  test('sem indentação comum o texto sai intacto', () => {
    assert.equal(PB.dedent('um\n  dois'), 'um\n  dois');
  });

  test('nulo e vazio viram string vazia', () => {
    assert.equal(PB.dedent(null), '');
    assert.equal(PB.dedent(''), '');
  });

  test('CRLF vira LF', () => {
    assert.equal(PB.dedent('  um\r\n  dois'), 'um\ndois');
  });
});

// ──────────────────────────────────────────────────────────────── fragment ──

describe('fragment — radio', () => {
  test('devolve o fragmento da opção escolhida', () => {
    assert.equal(PB.fragment(RADIO, 'a'), '<a/>');
    assert.equal(PB.fragment(RADIO, 'b'), '<b/>');
  });

  test('valor que não casa com opção nenhuma devolve vazio', () => {
    assert.equal(PB.fragment(RADIO, 'z'), '');
    assert.equal(PB.fragment(RADIO, undefined), '');
  });
});

describe('fragment — checkbox', () => {
  test('nenhuma marcada devolve vazio', () => {
    assert.equal(PB.fragment(CHECK('newline'), []), '');
    assert.equal(PB.fragment(CHECK('newline'), undefined), '');
  });

  test('algumas marcadas', () => {
    assert.equal(PB.fragment(CHECK('newline'), ['um', 'tres']), '<um/>\n<tres/>');
  });

  test('todas marcadas', () => {
    assert.equal(PB.fragment(CHECK('newline'), ['um', 'dois', 'tres']), '<um/>\n<dois/>\n<tres/>');
  });

  test('a ordem é a da spec, não a do clique', () => {
    // O mesmo conjunto de respostas tem de produzir o mesmo prompt, sempre: senão duas
    // pessoas que marcaram o mesmo colam prompts diferentes e não há como comparar.
    assert.equal(PB.fragment(CHECK('newline'), ['tres', 'um', 'dois']), '<um/>\n<dois/>\n<tres/>');
  });

  test('os quatro valores de join', () => {
    const todas = ['um', 'dois', 'tres'];
    assert.equal(PB.fragment(CHECK('newline'), todas), '<um/>\n<dois/>\n<tres/>');
    assert.equal(PB.fragment(CHECK('blank-line'), todas), '<um/>\n\n<dois/>\n\n<tres/>');
    assert.equal(PB.fragment(CHECK('comma'), todas), '<um/>, <dois/>, <tres/>');
    assert.equal(PB.fragment(CHECK('space'), todas), '<um/> <dois/> <tres/>');
  });

  test('join desconhecido cai em newline', () => {
    assert.equal(PB.fragment(CHECK('pipe'), ['um', 'dois']), '<um/>\n<dois/>');
    assert.equal(PB.fragment(CHECK(undefined), ['um', 'dois']), '<um/>\n<dois/>');
  });
});

describe('fragment — text e textarea', () => {
  for (const type of ['text', 'textarea']) {
    test(`${type}: o valor entra sem escape, só com as pontas aparadas`, () => {
      const q = { type, id: 't', options: [] };
      assert.equal(PB.fragment(q, '  <x a="1"/>  \n'), '<x a="1"/>');
      assert.equal(PB.fragment(q, ''), '');
      assert.equal(PB.fragment(q, null), '');
      assert.equal(PB.fragment(q, '   '), '');
    });
  }
});

// ──────────────────────────────────────────────────────────────── defaults ──

describe('defaults', () => {
  test('radio: fica com a opção default="true"', () => {
    const m = modelo(`<prompt-builder id="p">
      <question id="r" type="radio" label="R">
        <option value="a" label="A"/>
        <option value="b" label="B" default="true"/>
      </question>
      <template><![CDATA[{{r}}]]></template>
    </prompt-builder>`);
    assert.deepEqual(PB.defaults(m), { r: 'b' });
  });

  test('radio sem default cai na PRIMEIRA opção do XML — nunca vazio', () => {
    const m = modelo(`<prompt-builder id="p">
      <question id="r" type="radio" label="R">
        <option value="a" label="A"/>
        <option value="b" label="B"/>
      </question>
      <template><![CDATA[{{r}}]]></template>
    </prompt-builder>`);
    assert.deepEqual(PB.defaults(m), { r: 'a' });
  });

  test('só o valor exato "true" marca a opção', () => {
    const m = modelo(`<prompt-builder id="p">
      <question id="c" type="checkbox" label="C">
        <option value="sim" label="sim" default="true"/>
        <option value="um" label="um" default="1"/>
        <option value="yes" label="yes" default="yes"/>
        <option value="maiusc" label="maiusc" default="TRUE"/>
        <option value="pelado" label="pelado" default/>
      </question>
      <template><![CDATA[{{c}}]]></template>
    </prompt-builder>`);
    assert.deepEqual(PB.defaults(m), { c: ['sim'] });
  });

  test('checkbox sem nenhuma marcada abre com lista vazia', () => {
    const m = modelo(`<prompt-builder id="p">
      <question id="c" type="checkbox" label="C">
        <option value="um" label="um"/>
      </question>
      <template><![CDATA[{{c}}]]></template>
    </prompt-builder>`);
    assert.deepEqual(PB.defaults(m), { c: [] });
  });

  test('text/textarea partem do atributo default', () => {
    const m = modelo(`<prompt-builder id="p">
      <question id="t" type="text" label="T" default="um valor"/>
      <question id="a" type="textarea" label="A"/>
      <template><![CDATA[{{t}}{{a}}]]></template>
    </prompt-builder>`);
    assert.deepEqual(PB.defaults(m), { t: 'um valor', a: '' });
  });
});

// ─────────────────────────────────────────────────────────────────── model ──

describe('model', () => {
  test('<option> de corpo vazio usa o próprio value como fragmento', () => {
    const m = modelo(`<prompt-builder id="p">
      <question id="r" type="radio" label="R">
        <option value="alfa" label="A"/>
        <option value="beta" label="B"><![CDATA[<b/>]]></option>
      </question>
      <template><![CDATA[{{r}}]]></template>
    </prompt-builder>`);
    assert.deepEqual(m.questions[0].options.map((o) => o.fragment), ['alfa', '<b/>']);
  });

  test('<option> sem label cai no value', () => {
    const m = modelo(`<prompt-builder id="p">
      <question id="r" type="radio" label="R"><option value="alfa"/></question>
      <template><![CDATA[{{r}}]]></template>
    </prompt-builder>`);
    assert.equal(m.questions[0].options[0].label, 'alfa');
  });

  test('padrões do elemento raiz e da pergunta', () => {
    const m = modelo('<prompt-builder><template><![CDATA[x]]></template></prompt-builder>');
    assert.equal(m.id, 'pb');
    assert.equal(m.lang, 'xml');
    assert.equal(m.title, '');
    assert.equal(m.template, 'x');
  });
});

// ─────────────────────────────────────────────────────────────────── build ──

describe('build — substituição do §2', () => {
  const q = (over) => ({ type: 'text', options: [], ...over });

  test('marcador sozinho na linha: a indentação dele vai para TODAS as linhas', () => {
    const m = {
      questions: [q({ id: 'f', type: 'radio', options: [{ value: 'a', fragment: '<a>\n  <b/>\n</a>', checked: true }] })],
      template: '<root>\n    {{f}}\n</root>',
    };
    assert.equal(PB.build(m, { f: 'a' }), '<root>\n    <a>\n      <b/>\n    </a>\n</root>');
  });

  test('linha em branco no meio do fragmento não recebe indentação', () => {
    const m = {
      questions: [q({ id: 'f', type: 'checkbox', join: 'blank-line', options: [
        { value: 'x', fragment: '<x/>', checked: true },
        { value: 'y', fragment: '<y/>', checked: true },
      ] })],
      template: '  {{f}}',
    };
    assert.equal(PB.build(m, { f: ['x', 'y'] }), '  <x/>\n\n  <y/>');
  });

  test('resultado vazio some com a linha inteira, sem deixar buraco', () => {
    const m = {
      questions: [q({ id: 'f', type: 'checkbox', options: [{ value: 'x', fragment: '<x/>', checked: false }] })],
      template: '<root>\n  {{f}}\n</root>',
    };
    assert.equal(PB.build(m, { f: [] }), '<root>\n</root>');
  });

  test('marcador no meio da linha: substituição seca, sem reindentar', () => {
    const m = { questions: [q({ id: 'f' })], template: '  <a x="{{f}}"/>' };
    assert.equal(PB.build(m, { f: 'v' }), '  <a x="v"/>');
  });

  test('marcador órfão sai literal — é assim que o linter enxerga a pergunta renomeada', () => {
    const m = { questions: [q({ id: 'f' })], template: '{{f}}\n{{fantasma}}\nfim {{outro}}' };
    assert.equal(PB.build(m, { f: 'v' }), 'v\n{{fantasma}}\nfim {{outro}}');
  });

  test('o mesmo marcador em duas linhas é substituído nas duas', () => {
    const m = { questions: [q({ id: 'f' })], template: '{{f}}\n{{f}}' };
    assert.equal(PB.build(m, { f: 'v' }), 'v\nv');
  });

  test('text de várias linhas também herda a indentação do marcador', () => {
    const m = { questions: [q({ id: 'f', type: 'textarea' })], template: '  {{f}}' };
    assert.equal(PB.build(m, { f: 'um\ndois' }), '  um\n  dois');
  });

  test('marcador solo com tabulação preserva a tabulação', () => {
    const m = { questions: [q({ id: 'f' })], template: '\t{{f}}' };
    assert.equal(PB.build(m, { f: 'um\ndois' }), '\tum\n\tdois');
  });
});

// ──────────────────────────────────────── o documento não pode mentir em PDF ──

describe('prompt-builder.html — a saída pré-preenchida', () => {
  const model = PB.model(parseXml(specSource()));

  test('a spec do arquivo tem as seis perguntas do §, com os tipos declarados', () => {
    assert.deepEqual(model.questions.map((q) => `${q.id}:${q.type}`), [
      'alvo:text', 'contexto:textarea', 'profundidade:radio',
      'formato:radio', 'secoes:checkbox', 'restricoes:checkbox',
    ]);
  });

  test('byte a byte: <code data-pb-output> === build(model, defaults(model))', () => {
    const montado = PB.build(model, PB.defaults(model));
    assert.equal(montado, outputSource(),
      'o prompt escrito no HTML divergiu do que o runtime monta na combinação padrão — '
      + 'quem lê sem JavaScript, ou imprime, recebe um prompt que o construtor nunca produziria');
  });

  test('o [data-pb-status] escrito no arquivo anuncia o número de linhas que a saída realmente tem', () => {
    const montado = PB.build(model, PB.defaults(model));
    const status = BUILDER_HTML.match(/data-pb-status[^>]*>([^<]*)</);
    assert.ok(status, 'não achei o [data-pb-status] no arquivo');
    const n = status[1].match(/(\d+)\s+linhas/);
    assert.ok(n, `o status "${status[1]}" não declara um número de linhas`);
    assert.equal(montado.split('\n').length, Number(n[1]));
  });
});
