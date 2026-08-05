/**
 * mini-xml.mjs — parser XML mínimo, só o suficiente para a camada `model` do construtor.
 *
 * O runtime expõe `pbModel`, que usa exatamente quatro coisas do DOM: `getAttribute`,
 * `children`, `tagName` e `textContent`. Em navegador quem fornece isso é o `DOMParser`,
 * que não existe em Node — então a suíte fornece o mesmo mínimo aqui, sem dependência.
 *
 * O que este parser precisa entender (e entende): CDATA, comentário XML, tag auto-fechada,
 * aspas simples e duplas, e `>` dentro de valor de atributo — todas armadilhas que a spec
 * do construtor pode legitimamente conter.
 *
 * ── A DIREÇÃO DA DIVERGÊNCIA (leia antes de escrever um fixture novo) ────────────────────
 * Ele NÃO é um validador, e diverge do `DOMParser` sempre para o MESMO lado: onde o navegador
 * é FATAL, aqui é tolerante. O `DOMParser` recusa o documento inteiro (e a aba abre com o
 * aviso vermelho) em pelo menos oito casos que este parser engole calado:
 *
 *     `<` cru no valor de um atributo · atributo repetido na mesma tag · entidade não
 *     declarada (&nbsp;) · `&` cru no texto · valor de atributo sem aspas · atributo pelado
 *     (`default` sem `="…"`) · tag nunca fechada · tags cruzadas (`<a><b></a></b>`)
 *
 * Consequência prática: um fixture MAL-FORMADO passa aqui e morre no navegador — e o teste
 * que o usasse estaria afirmando uma semântica que não existe. Fixture de spec inválida é
 * assunto do `parseXml()` do `new-builder.mjs`, que recusa esses oito casos com o número da
 * linha (ver `new-builder.test.mjs`). Aqui só entram fixtures BEM-FORMADOS.
 * A divergência nunca é ao contrário: não há caso em que este parser recuse e o navegador aceite.
 */

const ENTS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTS[e] ?? m;
  });
}

/** Fim (`>`) da tag aberta em `lt`, ignorando `>` dentro de valor entre aspas. */
function tagEnd(src, lt) {
  let q = null;
  for (let i = lt + 1; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '>') return i;
  }
  return src.length;
}

function parseAttrs(raw) {
  const out = {};
  const re = /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(raw))) {
    const name = m[1];
    // Atributo repetido: aqui vale o PRIMEIRO. Não é "o que o DOMParser faz" — o DOMParser
    // não fica com nenhum: atributo repetido viola a WFC "Unique Att Spec" do XML 1.0 e ele
    // RECUSA o documento («Attribute value redefined»). Ficar com o primeiro é só a escolha
    // tolerante deste parser, na direção descrita no topo do arquivo; spec com atributo
    // repetido é caso do parseXml() do gerador, que a recusa nomeando a linha.
    if (Object.prototype.hasOwnProperty.call(out, name)) continue;
    const v = m[2] ?? m[3] ?? m[4] ?? null;
    out[name] = v === null ? '' : decode(v);
  }
  return out;
}

function makeEl(tagName, attrs) {
  const nodes = [];
  return {
    tagName,
    attrs,
    nodes,
    getAttribute(n) {
      return Object.prototype.hasOwnProperty.call(attrs, n) ? attrs[n] : null;
    },
    get children() {
      return nodes.filter((n) => typeof n !== 'string');
    },
    get textContent() {
      return nodes.map((n) => (typeof n === 'string' ? n : n.textContent)).join('');
    },
  };
}

/** Devolve o elemento raiz do XML, ou lança se não houver nenhum. */
export function parseXml(src) {
  const root = makeEl('#document', {});
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const text = (t) => { if (t) top().nodes.push(t); };

  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) { text(decode(src.slice(i))); break; }
    if (lt > i) text(decode(src.slice(i, lt)));

    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt);
      const stop = end === -1 ? src.length : end;
      text(src.slice(lt + 9, stop)); // CDATA entra cru: nada de decodificar entidade
      i = stop + 3;
      continue;
    }
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt);
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith('<?', lt) || src.startsWith('<!', lt)) {
      i = tagEnd(src, lt) + 1;
      continue;
    }
    const gt = tagEnd(src, lt);
    const raw = src.slice(lt + 1, gt);
    i = gt + 1;

    if (raw[0] === '/') { if (stack.length > 1) stack.pop(); continue; }

    const selfClosing = /\/\s*$/.test(raw);
    const body = selfClosing ? raw.replace(/\/\s*$/, '') : raw;
    const name = (body.match(/^[^\s/>]+/) || [''])[0];
    const el = makeEl(name, parseAttrs(body.slice(name.length)));
    top().nodes.push(el);
    if (!selfClosing) stack.push(el);
  }

  const first = root.children[0];
  if (!first) throw new Error('XML sem elemento raiz');
  return first;
}
