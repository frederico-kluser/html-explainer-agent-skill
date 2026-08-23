// Teste de regressão do install.sh, escrito por causa de um bug específico.
//
// O bug: numa máquina que ainda não tinha ~/.agents/skills, o laço de symlinks
// pulava o canônico ("diretório que não existe é pulado"), o plannotator-setup
// criava esse diretório MINUTOS DEPOIS para guardar as skills de terceiros, e o
// comando do passo 0 do SKILL.md — que procura a skill ali — não achava nada.
// Exit 127, que o procedimento não sabe tratar. Invisível em qualquer máquina
// onde o diretório já existisse, que é o caso da máquina de quem escreveu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = join(REPO, 'install.sh');

const lixo = [];
const temp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); lixo.push(d); return d; };
test.after(() => { for (const d of lixo) rmSync(d, { recursive: true, force: true }); });

function repoFalso(caminho) {
  const raiz = temp('hx-inst-git-');
  mkdirSync(join(raiz, caminho), { recursive: true });
  writeFileSync(join(raiz, caminho, 'SKILL.md'), '---\nname: fake\n---\n');
  execFileSync('git', ['-C', raiz, 'init', '-q', '-b', 'main'], { stdio: 'pipe' });
  execFileSync('git', ['-C', raiz, 'add', '-A'], { stdio: 'pipe' });
  execFileSync('git', ['-C', raiz, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'i'], { stdio: 'pipe' });
  return `file://${raiz}`;
}

function instalarEm(home, extraEnv = {}) {
  const binDir = join(home, '.local', 'bin');
  mkdirSync(binDir, { recursive: true });
  const bin = join(binDir, 'plannotator');
  writeFileSync(bin, '#!/usr/bin/env bash\ncase "${1:-}" in\n  --version) echo "plannotator 9.9.9" ;;\n  annotate) echo "usage: annotate" >&2; exit 1 ;;\nesac\n');
  chmodSync(bin, 0o755);
  const r = spawnSync('bash', [INSTALL], {
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin', HOME: home, LANG: 'C', TMPDIR: tmpdir(),
      HX_PLANNOTATOR_BIN: bin,
      HX_PLANNOTATOR_INSTALL: '0',
      HX_PLANNOTATOR_REPO: repoFalso('apps/skills/extra/plannotator-visual-explainer'),
      HX_VE_REPO: repoFalso('plugins/visual-explainer'),
      ...extraEnv,
    },
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

test('primeira instalação numa máquina SEM ~/.agents/skills deixa o passo 0 executável', () => {
  const home = temp('hx-clean-');
  mkdirSync(join(home, '.claude', 'skills'), { recursive: true });   // só o perfil padrão

  const { code } = instalarEm(home);
  assert.equal(code, 0);

  const canon = join(home, '.agents', 'skills');
  assert.ok(existsSync(canon), 'o canônico tem de ser criado pelo install.sh');

  // O caminho exato que o passo 0 do SKILL.md procura primeiro.
  const passo0 = join(canon, 'html-explainer-agent-skill', 'scripts', 'plannotator-setup.sh');
  assert.ok(existsSync(passo0), 'sem isto o passo 0 sai 127, e o procedimento não sabe tratar 127');
  assert.ok(lstatSync(join(canon, 'html-explainer-agent-skill')).isSymbolicLink());
  assert.equal(realpathSync(join(canon, 'html-explainer-agent-skill')),
               realpathSync(join(REPO, 'html-explainer-agent-skill')));
});

test('--check não cria nada, nem o canônico', () => {
  const home = temp('hx-check-');
  mkdirSync(join(home, '.claude', 'skills'), { recursive: true });
  const r = spawnSync('bash', [INSTALL, '--check'], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', HOME: home, LANG: 'C', TMPDIR: tmpdir(), HX_PLANNOTATOR_INSTALL: '0' },
  });
  assert.ok(!existsSync(join(home, '.agents')), '--check promete não escrever');
  assert.match(r.stdout, /criaria/);
});

test('--no-plannotator liga os links e avisa que a skill não entrega sem o Plannotator', () => {
  const home = temp('hx-nopl-');
  mkdirSync(join(home, '.claude', 'skills'), { recursive: true });
  const r = spawnSync('bash', [INSTALL, '--no-plannotator'], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', HOME: home, LANG: 'C', TMPDIR: tmpdir() },
  });
  assert.equal(r.status, 0);
  assert.ok(existsSync(join(home, '.claude/skills/html-explainer-agent-skill/SKILL.md')));
  assert.match(r.stdout, /NÃO entrega sem ele/);
});
