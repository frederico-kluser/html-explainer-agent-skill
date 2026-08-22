/**
 * O helper `mini-xml.mjs` — o parser que faz as vezes do `DOMParser` para a camada `model`.
 *
 * Ele não é código de produção, mas é a lente por onde a suíte inteira enxerga a spec: um
 * defeito aqui não FALHA um teste, ele o faz afirmar a coisa errada com toda a confiança.
 * Daí este arquivo. E daí, sobretudo, o último bloco: a DIREÇÃO da divergência em relação ao
 * `DOMParser` de verdade, fixada em teste para que ninguém a atravesse por engano.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseXml } from './helpers/mini-xml.mjs';
import { parseXml as parseEstrito } from '../html-explainer-agent-skill/scripts/new-builder.mjs';

describe('mini-xml — o mínimo que a camada model usa', () => {
  test('tagName, getAttribute e children', () => {
    const r = parseXml('<a x="1"><b/><c y="2"/></a>');
    assert.equal(r.tagName, 'a');
    assert.equal(r.getAttribute('x'), '1');
    assert.equal(r.getAttribute('nao-existe'), null, 'atributo ausente é null, como no DOM');
    assert.deepEqual(r.children.map((c) => c.tagName), ['b', 'c']);
    assert.equal(r.children[1].getAttribute('y'), '2');
  });

  test('children ignora texto; textContent concatena tudo, em ordem de documento', () => {
    const r = parseXml('<a>um<b>dois</b>tres<c/></a>');
    assert.deepEqual(r.children.map((c) => c.tagName), ['b', 'c']);
    assert.equal(r.textContent, 'umdoistres');
  });

  test('atributo pelado vira string vazia (o DOM devolveria "" também, se aceitasse a tag)', () => {
    assert.equal(parseXml('<a b/>').getAttribute('b'), '');
  });

  test('aspas simples e duplas, e espaço em volta do =', () => {
    const r = parseXml('<a x = "1" y=\'2\' z=3/>');
    assert.deepEqual([r.getAttribute('x'), r.getAttribute('y'), r.getAttribute('z')], ['1', '2', '3']);
  });

  test('">" dentro do valor não corta a tag no meio', () => {
    const r = parseXml('<a label="custo > 0" help=\'a > b\'><b/></a>');
    assert.equal(r.getAttribute('label'), 'custo > 0');
    assert.equal(r.getAttribute('help'), 'a > b');
    assert.deepEqual(r.children.map((c) => c.tagName), ['b']);
  });

  test('entidades: as cinco do XML e as numéricas, decimais e hexadecimais', () => {
    const r = parseXml('<a t="&lt;&gt;&amp;&quot;&apos;&#65;&#x42;">&lt;i&gt; &amp;&#233;</a>');
    assert.equal(r.getAttribute('t'), '<>&"\'AB');
    assert.equal(r.textContent, '<i> &é');
  });

  test('entidade desconhecida sai literal — o parser não inventa valor', () => {
    assert.equal(parseXml('<a>&nbsp;&foo;</a>').textContent, '&nbsp;&foo;');
  });

  test('CDATA entra CRU: nada de decodificar entidade lá dentro', () => {
    const r = parseXml('<a><![CDATA[<b x="1"/> & &amp; ]]></a>');
    assert.equal(r.textContent, '<b x="1"/> & &amp; ');
    assert.equal(r.children.length, 0, 'o markup dentro do CDATA não vira elemento');
  });

  test('CDATA sem fechamento vai até o fim, em vez de estourar', () => {
    assert.equal(parseXml('<a><![CDATA[sem fim').textContent, 'sem fim');
  });

  // Esta linha e a próxima são as que a cobertura nunca visitava: comentário, PI e DOCTYPE.
  test('comentário XML é descartado, e o que ele cita não vira elemento', () => {
    const r = parseXml('<a><!-- <b/> um <c x="1"/> comentado -->texto</a>');
    assert.deepEqual(r.children.map((c) => c.tagName), []);
    assert.equal(r.textContent, 'texto');
  });

  test('comentário sem fechamento engole o resto', () => {
    assert.equal(parseXml('<a>ok<!-- sem fim').textContent, 'ok');
  });

  test('instrução de processamento e DOCTYPE são pulados, e a raiz é a tag seguinte', () => {
    const r = parseXml('<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE prompt-builder>\n<a><b/></a>');
    assert.equal(r.tagName, 'a');
    assert.deepEqual(r.children.map((c) => c.tagName), ['b']);
  });

  test('auto-fechamento com espaço antes da barra', () => {
    const r = parseXml('<a><b x="1" /><c/></a>');
    assert.deepEqual(r.children.map((c) => c.tagName), ['b', 'c']);
  });

  test('a raiz é o PRIMEIRO elemento; sem elemento nenhum, lança', () => {
    assert.equal(parseXml('  \n<a/>\n<b/>').tagName, 'a');
    assert.throws(() => parseXml('   '), /XML sem elemento raiz/);
    assert.throws(() => parseXml('<!-- só um comentário -->'), /XML sem elemento raiz/);
  });

  test('fechamento a mais não derruba a pilha abaixo da raiz', () => {
    assert.equal(parseXml('</x><a/>').tagName, 'a');
  });
});

// ────────────────────────────────────────────────── a direção da divergência ──
//
// Os oito casos em que o `DOMParser` do navegador é FATAL e este parser é tolerante. Fixá-los
// em teste tem um propósito só: quem escrever um fixture mal-formado descobre aqui — pelo
// `parseXml()` do gerador, que é estrito e recusa — em vez de descobrir no navegador, depois
// de um teste verde ter afirmado uma semântica que não existe.

describe('mini-xml × DOMParser: onde o navegador RECUSA, este helper engole', () => {
  // `estrito: true` = o parseXml() do gerador também recusa, e aí a rede de proteção existe.
  // `estrito: false` = NEM ele recusa: o caso passa em Node e só morre no navegador. São
  // exatamente esses quatro que ninguém pode usar como fixture achando que está testando algo.
  const casos = [
    { nome: 'atributo repetido', xml: '<a x="1" x="2"/>', estrito: true },
    { nome: 'atributo pelado', xml: '<a default/>', estrito: true },
    { nome: 'valor de atributo sem aspas', xml: '<a x=1/>', estrito: true },
    { nome: 'tag nunca fechada', xml: '<a><b></a>', estrito: true },
    { nome: 'tags cruzadas', xml: '<a><b><c></b></c></a>', estrito: true },
    { nome: '"<" cru no valor de atributo', xml: '<a x="1 < 2"/>', estrito: false },
    { nome: '"&" cru no texto', xml: '<a>a & b</a>', estrito: false },
    { nome: 'entidade não declarada (&nbsp;)', xml: '<a>&nbsp;</a>', estrito: false },
  ];

  for (const { nome, xml, estrito } of casos) {
    test(`${nome}: o mini-xml aceita — o parser estrito ${estrito ? 'recusa' : 'TAMBÉM aceita'}`, () => {
      assert.equal(parseXml(xml).tagName, 'a', 'o mini-xml devolveu a raiz sem reclamar');
      if (estrito) assert.throws(() => parseEstrito(xml), (e) => e.name === 'PbError' || e instanceof Error, xml);
      else assert.equal(parseEstrito(xml).tagName, 'a', xml);
    });
  }

  test('atributo repetido: aqui vale o PRIMEIRO — e isso NÃO é o que o DOMParser faz', () => {
    // XML 1.0, WFC "Unique Att Spec": atributo repetido é erro fatal, o DOMParser devolve um
    // <parsererror> («Attribute value redefined») e o documento inteiro é recusado. Ficar com
    // o primeiro é a tolerância deste helper, não uma imitação do navegador.
    assert.equal(parseXml('<a x="1" x="2"/>').getAttribute('x'), '1');
    assert.throws(() => parseEstrito('<a x="1" x="2"/>'), /atributo "x" repetido/);
  });

  test('os quatro casos que o parser estrito recusa com a linha', () => {
    for (const xml of ['<a default/>', '<a x=1/>', '<a><b></a>', '<a x="1" x="2"/>'])
      assert.throws(() => parseEstrito(xml), /linha \d+|nunca foi fechado/, xml);
  });
});
