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
    if (Object.prototype.hasOwnProperty.call(out, name)) continue; // o DOMParser fica com o primeiro
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
