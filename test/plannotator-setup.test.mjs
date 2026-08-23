// Testes do motor de setup da skill.
//
// Duas regras que valem para todo caso aqui:
//
// 1. NADA de rede. Onde o script baixaria, apontamos as variáveis de origem
//    (HX_INSTALL_URL, HX_PLANNOTATOR_REPO, HX_VE_REPO) para `file://` num repo
//    git de mentira criado na hora. É assim que fetch_skill e install_bin —
//    justamente os dois caminhos que baixam e dão rm -rf — ficam cobertos.
// 2. NADA de $HOME real e nada de ambiente herdado. O env é montado por
//    allowlist: um HX_PLANNOTATOR_BIN exportado no shell de quem roda os testes
//    não pode virar um verde falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync,
  lstatSync, realpathSync, rmSync, existsSync, symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO, 'html-explainer-agent-skill', 'scripts', 'plannotator-setup.sh');
const MARK = '.installed-by-html-explainer';

// Frontmatter igual ao que o Plannotator publica: chega TRAVADO para o modelo.
const LOCKED_SKILL = `---
name: plannotator-visual-explainer
disable-model-invocation: true
description: fake
---
# fake
`;

// O tema dark QUEBRADO que a skill de render (v0.27.6) prescreve: primário
// roxo-claro + texto quase preto sobre um fundo quase preto — nasce ilegível.
const THEME_BROKEN = `const mermaidThemeVariables = isDark
  ? {
      darkMode: true,
      primaryColor: '#9a9dff',
      primaryTextColor: '#070b14',
      primaryBorderColor: '#343b45',
      lineColor: '#9da5b2',
      secondaryColor: '#1e242e',
      secondaryTextColor: '#dadee5',
      tertiaryColor: '#1e242e',
      tertiaryTextColor: '#dadee5',
      background: '#070b14',
    }
  : { /* light ok */ };
`;

// O tema dark SAUDÁVEL (fundo escuro + texto claro, sem o par quebrado): o patch
// não deve encostar nele.
const THEME_HEALTHY = `const mermaidThemeVariables = isDark
  ? {
      darkMode: true,
      primaryColor: '#1e242e',
      primaryTextColor: '#dadee5',
      background: '#070b14',
    }
  : { /* light ok */ };
`;

const FAKE_BIN = (v) => `#!/usr/bin/env bash
case "\${1:-}" in
  --version) echo "plannotator ${v}" ;;
  annotate)  echo "usage: plannotator annotate <file> [--gate] [--json]" >&2; exit 1 ;;
  *)         echo "usage" >&2; exit 1 ;;
esac
`;

// Um binário que existe, roda, e NÃO responde a sonda: o estado 'quebrado'.
const BROKEN_BIN = `#!/usr/bin/env bash
echo "segmentation fault (não é bem isso, mas o efeito é o mesmo)" >&2
exit 3
`;

const tempos = [];
function temp(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tempos.push(d);
  return d;
}
test.after(() => {
  // Teardown de verdade: um caso que falha no meio não pode deixar um $HOME de
  // mentira inteiro para trás. rmSync na última linha do teste não garante isso.
  for (const d of tempos) rmSync(d, { recursive: true, force: true });
});

function fakeHome({
  bin = 'ok',                 // 'ok' | 'quebrado' | 'ausente'
  withRender = true,
  withVe = true,
  marcado = true,             // as cópias canônicas levam a marca de autoria?
  dirs = ['.agents/skills', '.claude/skills', '.claude-deepseek/skills'],
} = {}) {
  const home = temp('hx-home-');
  for (const d of dirs) mkdirSync(join(home, d), { recursive: true });

  const binDir = join(home, '.local', 'bin');
  mkdirSync(binDir, { recursive: true });
  if (bin !== 'ausente') {
    const p = join(binDir, 'plannotator');
    writeFileSync(p, bin === 'ok' ? FAKE_BIN('9.9.9') : BROKEN_BIN);
    chmodSync(p, 0o755);
  }
  const canon = join(home, '.agents', 'skills');
  const por = (nome, corpo) => {
    mkdirSync(join(canon, nome), { recursive: true });
    writeFileSync(join(canon, nome, 'SKILL.md'), corpo);
    if (marcado) writeFileSync(join(canon, nome, MARK), 'html-explainer-agent-skill\n');
  };
  if (withRender) por('plannotator-visual-explainer', LOCKED_SKILL);
  if (withVe) por('visual-explainer', '---\nname: visual-explainer\n---\n');
  return home;
}

function run(home, args = [], extraEnv = {}) {
  // Allowlist, não spread: o ambiente de quem roda os testes fica de fora.
  const env = {
    PATH: `${join(home, '.local', 'bin')}:/usr/bin:/bin`,
    HOME: home,
    LANG: 'C',
    TMPDIR: tmpdir(),
    HX_PLANNOTATOR_INSTALL: '0',   // cinto: nenhum caso baixa binário sem pedir
    ...extraEnv,
  };
  // spawnSync, e não execFileSync: o caminho de SUCESSO do execFileSync devolve
  // só o stdout e deixa o stderr vazar para o terminal — e foi exatamente assim
  // que a asserção sobre o modo --minimal passou a olhar para uma string vazia.
  const r = spawnSync('bash', [SCRIPT, ...args], { env, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// Repo git local com a skill dentro, servido por file:// — o que substitui o
// GitHub nos testes de fetch_skill. `theme` é o conteúdo de
// `references/theme-override.md`: quando presente, o arquivo (que é o alvo real
// do patch de contraste) é criado já com esse conteúdo dentro da skill.
function repoFalso(caminhoDaSkill, { tag = null, theme = null } = {}) {
  const raiz = temp('hx-git-');
  const alvo = join(raiz, caminhoDaSkill);
  mkdirSync(alvo, { recursive: true });
  writeFileSync(join(alvo, 'SKILL.md'), LOCKED_SKILL);
  if (theme !== null) {
    const refs = join(alvo, 'references');
    mkdirSync(refs, { recursive: true });
    writeFileSync(join(refs, 'theme-override.md'), theme);
  }
  const g = (...a) => execFileSync('git', ['-C', raiz, ...a], { stdio: 'pipe' });
  g('init', '-q', '-b', 'main');
  g('add', '-A');
  execFileSync('git', ['-C', raiz, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { stdio: 'pipe' });
  if (tag) g('tag', tag);
  return `file://${raiz}`;
}

// ---------------------------------------------------------------- estado

test('--check relata sem escrever, e travada não é PRONTO', () => {
  const home = fakeHome();
  const antes = lstatSync(join(home, '.claude', 'skills')).mtimeMs;
  const { code, stdout } = run(home, ['--check', '--json']);
  const j = JSON.parse(stdout);
  assert.equal(j.binario, 'ok');
  assert.equal(j.versao, '9.9.9');
  assert.equal(j.render_skill, 'ok');
  assert.equal(j.invocacao_modelo, 'travada', '--check não destrava porque --check não escreve');
  assert.equal(code, 1);
  assert.equal(lstatSync(join(home, '.claude', 'skills')).mtimeMs, antes);
});

test('binário que roda mas não responde à sonda é "quebrado", não "ok"', () => {
  const home = fakeHome({ bin: 'quebrado' });
  const j = JSON.parse(run(home, ['--json']).stdout);
  assert.equal(j.binario, 'quebrado');
});

test('sem binário e com instalação proibida o veredito é 2, não 1', () => {
  // 1 significa "dá para resolver rodando --install". Com a instalação
  // proibida, mandar rodar --install seria mandar bater na mesma porta.
  const home = fakeHome({ bin: 'ausente' });
  const { code, stdout } = run(home, ['--json'], { HX_PLANNOTATOR_INSTALL: '0' });
  assert.equal(JSON.parse(stdout).binario, 'ausente');
  assert.equal(code, 2);
});

test('sem binário mas com instalação permitida o veredito é 1', () => {
  const home = fakeHome({ bin: 'ausente' });
  const { code } = run(home, ['--json'], { HX_PLANNOTATOR_INSTALL: '1' });
  assert.equal(code, 1);
});

test('HX_PLANNOTATOR_BIN vence o PATH', () => {
  const home = fakeHome({ bin: 'ausente' });
  const alt = join(home, 'outro-lugar');
  mkdirSync(alt, { recursive: true });
  const bin = join(alt, 'plannotator');
  writeFileSync(bin, FAKE_BIN('1.2.3'));
  chmodSync(bin, 0o755);
  const j = JSON.parse(run(home, ['--json'], { HX_PLANNOTATOR_BIN: bin }).stdout);
  assert.equal(j.binario, 'ok');
  assert.equal(j.versao, '1.2.3');
  assert.equal(j.caminho, bin);
});

// ---------------------------------------------------------------- install

test('--install destrava a invocação pelo modelo na cópia instalada', () => {
  const home = fakeHome();
  const { code } = run(home, ['--install']);
  const md = readFileSync(join(home, '.agents/skills/plannotator-visual-explainer/SKILL.md'), 'utf8');
  assert.ok(!md.includes('disable-model-invocation: true'));
  assert.ok(md.includes('name: plannotator-visual-explainer'), 'o resto do frontmatter fica');
  assert.equal(code, 0);
});

test('--install espalha symlink para todo agent skill dir presente', () => {
  const home = fakeHome();
  run(home, ['--install']);
  for (const d of ['.claude/skills', '.claude-deepseek/skills']) {
    for (const nome of ['plannotator-visual-explainer', 'visual-explainer']) {
      const link = join(home, d, nome);
      assert.ok(lstatSync(link).isSymbolicLink(), `${d}/${nome} deve ser symlink`);
      assert.equal(realpathSync(link), realpathSync(join(home, '.agents/skills', nome)));
    }
  }
});

test('a segunda rodada não refaz trabalho — idempotência observável', () => {
  const home = fakeHome();
  run(home, ['--install']);
  const { code, stdout } = run(home, ['--install']);
  assert.equal(code, 0);
  assert.ok(!stdout.includes('espalhado para'), 'nada a espalhar na segunda vez');
  assert.ok(!stdout.includes('Buscando'), 'nada a buscar na segunda vez');
});

test('diretório REAL no lugar do symlink é preservado', () => {
  const home = fakeHome();
  const real = join(home, '.claude/skills/visual-explainer');
  mkdirSync(real, { recursive: true });
  writeFileSync(join(real, 'SKILL.md'), '# instalado por outro caminho\n');
  run(home, ['--install']);
  assert.ok(!lstatSync(real).isSymbolicLink());
  assert.match(readFileSync(join(real, 'SKILL.md'), 'utf8'), /outro caminho/);
});

test('symlink que aponta para OUTRO lugar não é sequestrado', () => {
  const home = fakeHome();
  const forkDir = join(home, 'meu-fork');
  mkdirSync(forkDir, { recursive: true });
  writeFileSync(join(forkDir, 'SKILL.md'), '# meu fork\n');
  const link = join(home, '.claude/skills/plannotator-visual-explainer');
  symlinkSync(forkDir, link);
  const { stdout } = run(home, ['--install']);
  assert.equal(realpathSync(link), realpathSync(forkDir), 'o fork continua sendo o alvo');
  assert.match(stdout, /deixei como está/);
});

test('diretório de agente que não existe é pulado, nunca criado', () => {
  const home = fakeHome({ dirs: ['.agents/skills'] });
  run(home, ['--install']);
  assert.ok(!existsSync(join(home, '.codex', 'skills')));
});

// ------------------------------------------------- fetch_skill (file://)

test('fetch_skill busca de verdade, grava a marca de autoria e destrava', () => {
  const home = fakeHome({ withRender: false, withVe: false });
  const origem = repoFalso('apps/skills/extra/plannotator-visual-explainer', { tag: 'v9.9.9' });
  const origemVe = repoFalso('plugins/visual-explainer');
  const { code, stdout } = run(home, ['--install'], {
    HX_PLANNOTATOR_REPO: origem,
    HX_VE_REPO: origemVe,
  });
  assert.match(stdout, /Buscando a skill de renderização/);
  const dest = join(home, '.agents/skills/plannotator-visual-explainer');
  assert.ok(existsSync(join(dest, 'SKILL.md')), 'a skill chegou');
  assert.ok(existsSync(join(dest, MARK)), 'a marca de autoria foi gravada');
  assert.ok(!readFileSync(join(dest, 'SKILL.md'), 'utf8').includes('disable-model-invocation: true'));
  assert.ok(existsSync(join(home, '.agents/skills/visual-explainer/SKILL.md')));
  assert.equal(code, 0);
});

test('fetch_skill NÃO sobrescreve um destino que não tem a marca', () => {
  const home = fakeHome({ withRender: false, withVe: false });
  const alheio = join(home, '.agents/skills/plannotator-visual-explainer');
  mkdirSync(alheio, { recursive: true });
  writeFileSync(join(alheio, 'MINHAS-NOTAS.md'), 'editei isto à mão\n');   // sem SKILL.md, sem marca
  const { stdout } = run(home, ['--install'], {
    HX_PLANNOTATOR_REPO: repoFalso('apps/skills/extra/plannotator-visual-explainer'),
    HX_VE_REPO: repoFalso('plugins/visual-explainer'),
  });
  assert.ok(existsSync(join(alheio, 'MINHAS-NOTAS.md')), 'a edição local sobreviveu');
  assert.match(stdout, /não foi instalado por este script/);
});

// ------------------------------------------------------- tema dark (contraste)

test('--install corrige o tema dark QUEBRADO do theme-override.md instalado', () => {
  const home = fakeHome({ withRender: false, withVe: false });
  const renderRepo = repoFalso('apps/skills/extra/plannotator-visual-explainer', { theme: THEME_BROKEN });
  const { code, stdout } = run(home, ['--install'], {
    HX_PLANNOTATOR_REPO: renderRepo,
    HX_VE_REPO: repoFalso('plugins/visual-explainer'),
  });
  const file = join(home, '.agents/skills/plannotator-visual-explainer/references/theme-override.md');
  const conteudo = readFileSync(file, 'utf8');
  assert.ok(conteudo.includes("primaryColor: '#1e242e'"), 'primário vira o fundo escuro');
  assert.ok(conteudo.includes("primaryTextColor: '#dadee5'"), 'texto vira o claro legível');
  assert.ok(!conteudo.includes("primaryColor: '#9a9dff'"), 'o primário quebrado some');
  assert.ok(!conteudo.includes("primaryTextColor: '#070b14'"), 'o texto quebrado some');
  assert.match(stdout, /tema dark corrigido/);
  assert.equal(code, 0);
});

test('o patch do tema dark é idempotente: segunda rodada não re-aplica nem corrompe', () => {
  const home = fakeHome({ withRender: false, withVe: false });
  const renderRepo = repoFalso('apps/skills/extra/plannotator-visual-explainer', { theme: THEME_BROKEN });
  const env = {
    HX_PLANNOTATOR_REPO: renderRepo,
    HX_VE_REPO: repoFalso('plugins/visual-explainer'),
  };
  run(home, ['--install'], env);
  const file = join(home, '.agents/skills/plannotator-visual-explainer/references/theme-override.md');
  const primeira = readFileSync(file, 'utf8');
  const { code, stdout } = run(home, ['--install'], env);
  const segunda = readFileSync(file, 'utf8');
  assert.equal(primeira, segunda, 'o conteúdo fica estável entre rodadas');
  assert.ok(segunda.includes("primaryColor: '#1e242e'"));
  assert.ok(segunda.includes("primaryTextColor: '#dadee5'"));
  assert.ok(!segunda.includes('#9a9dff'));
  assert.ok(!segunda.includes("primaryTextColor: '#070b14'"));
  assert.ok(!/tema dark corrigido/.test(stdout), 'na segunda rodada não re-aplica');
  assert.equal(code, 0);
});

test('tema dark JÁ saudável é respeitado: instalado e não corrompido pelo patch', () => {
  const home = fakeHome({ withRender: false, withVe: false });
  const renderRepo = repoFalso('apps/skills/extra/plannotator-visual-explainer', { theme: THEME_HEALTHY });
  const { code } = run(home, ['--install'], {
    HX_PLANNOTATOR_REPO: renderRepo,
    HX_VE_REPO: repoFalso('plugins/visual-explainer'),
  });
  const file = join(home, '.agents/skills/plannotator-visual-explainer/references/theme-override.md');
  assert.equal(readFileSync(file, 'utf8'), THEME_HEALTHY, 'o arquivo fica exatamente como veio');
  assert.equal(code, 0);
});

test('--install corrige MÁQUINA JÁ INSTALADA: skill presente com o tema quebrado é corrigida', () => {
  // O caso da frase "consertar máquinas JÁ instaladas": a skill já existe no
  // canônico (SKILL.md ok, sem fetch) mas carrega o par quebrado. O --install
  // dispara o patch mesmo sem buscar nada.
  const home = fakeHome({ withRender: true, withVe: true });
  const dir = join(home, '.agents/skills/plannotator-visual-explainer/references');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'theme-override.md'), THEME_BROKEN);
  const { code, stdout } = run(home, ['--install']);
  const file = join(dir, 'theme-override.md');
  const conteudo = readFileSync(file, 'utf8');
  assert.ok(conteudo.includes("primaryColor: '#1e242e'"));
  assert.ok(conteudo.includes("primaryTextColor: '#dadee5'"));
  assert.ok(!conteudo.includes('#9a9dff'));
  assert.match(stdout, /tema dark corrigido/);
  assert.equal(code, 0);
});

test('--install NÃO toca o tema de uma skill SEM a marca de autoria', () => {
  // Caso adversário confirmado em reprodução: a skill de render existe no
  // canônico SEM a marca (instalada por outro caminho — ex.: pelo próprio
  // instalador do Plannotator) e carrega o tema quebrado. O patch NÃO pode
  // reescrever um arquivo alheio mesmo tendo o que corrigir: ele não é nosso.
  const home = fakeHome({ withRender: true, withVe: true, marcado: false });
  const dir = join(home, '.agents/skills/plannotator-visual-explainer/references');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'theme-override.md'), THEME_BROKEN);
  const { code, stdout } = run(home, ['--install']);
  assert.equal(readFileSync(join(dir, 'theme-override.md'), 'utf8'), THEME_BROKEN,
    'o arquivo alheio fica EXATAMENTE como veio');
  assert.ok(!stdout.includes('tema dark corrigido'), 'nada de "tema dark corrigido" no stdout');
  assert.match(stdout, /tema não tocado/);
  assert.equal(code, 0);
});

// ------------------------------------------------- install_bin (file://)

test('install_bin roda o instalador apontado por HX_INSTALL_URL', () => {
  const home = fakeHome({ bin: 'ausente' });
  const dir = temp('hx-inst-');
  const instalador = join(dir, 'install.sh');
  // Instalador de mentira: prova que os argumentos chegaram e que o binário
  // acaba onde o script procura.
  writeFileSync(instalador, `#!/usr/bin/env bash
echo "args: $*" >&2
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/plannotator" <<'B'
${FAKE_BIN('7.7.7')}
B
chmod 755 "$HOME/.local/bin/plannotator"
`);
  const { code, stdout, stderr } = run(home, ['--install', '--json'], {
    HX_PLANNOTATOR_INSTALL: '1',
    HX_INSTALL_URL: `file://${instalador}`,
    HX_PLANNOTATOR_REPO: repoFalso('apps/skills/extra/plannotator-visual-explainer'),
    HX_VE_REPO: repoFalso('plugins/visual-explainer'),
  });
  assert.match(stderr ?? '', /--minimal/, 'sem HX_PLANNOTATOR_FULL, o modo é --minimal');
  const j = JSON.parse(stdout);
  assert.equal(j.binario, 'ok');
  assert.equal(j.versao, '7.7.7');
  assert.equal(code, 0);
});

// ---------------------------------------------------------------- uninstall

test('--uninstall remove o que tem a marca: symlinks e a cópia canônica', () => {
  const home = fakeHome();
  run(home, ['--install']);
  run(home, ['--uninstall']);
  for (const nome of ['plannotator-visual-explainer', 'visual-explainer']) {
    assert.ok(!existsSync(join(home, '.agents/skills', nome)), `o canônico ${nome} devia ter sumido`);
    for (const d of ['.claude/skills', '.claude-deepseek/skills']) {
      assert.ok(!existsSync(join(home, d, nome)), `${d}/${nome} devia ter sumido`);
    }
  }
  assert.ok(lstatSync(join(home, '.local/bin/plannotator')).isFile(), 'o binário fica');
});

test('--uninstall preserva a cópia que ESTE script não instalou', () => {
  const home = fakeHome({ marcado: false });
  const { stdout } = run(home, ['--uninstall']);
  assert.ok(existsSync(join(home, '.agents/skills/plannotator-visual-explainer/SKILL.md')));
  assert.match(stdout, /não foi instalado por este script/);
});

test('--uninstall --json imprime JSON, não prosa', () => {
  const home = fakeHome();
  run(home, ['--install']);
  const { stdout } = run(home, ['--uninstall', '--json']);
  const j = JSON.parse(stdout);
  assert.equal(typeof j.removidos, 'number');
  assert.equal(j.binario, 'intocado');
});

// ---------------------------------------------------------------- CLI

test('argumento desconhecido sai 2 e não faz nada', () => {
  const home = fakeHome();
  const { code } = run(home, ['--banana']);
  assert.equal(code, 2);
});

test('--help imprime o bloco INTEIRO, até a última variável', () => {
  // Já cortou no meio uma vez, porque o range do sed era contado à mão.
  const home = fakeHome();
  const { code, stdout } = run(home, ['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /--uninstall/);
  assert.match(stdout, /\$CANÔNICO\/visual-explainer/, 'a lista do que escreve não pode ser cortada');
  assert.match(stdout, /HX_INSTALL_URL/, 'a última linha do bloco tem de aparecer');
  assert.ok(!stdout.includes('@help-end'), 'o marcador não vaza para a ajuda');
});
