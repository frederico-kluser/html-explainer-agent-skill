# Plannotator: instalar, configurar, destravar, consertar

> Esta skill **não renderiza nada sozinha**. Ela escreve o BRIEF e entrega para a skill
> `plannotator-visual-explainer`, que compõe o HTML e o abre na UI de anotação do Plannotator.
> Sem Plannotator, a skill não entrega. Este arquivo é o que fazer quando ele não está lá.

## O caminho curto

```bash
# do repositório:
./install.sh
# ou, com a skill já instalada, achando o script onde quer que ele esteja:
for d in ~/.agents/skills ~/.claude/skills "${CLAUDE_CONFIG_DIR:-/nao-existe}/skills" ~/.claude-*/skills; do
  s="$d/html-explainer-agent-skill/scripts/plannotator-setup.sh"
  [ -f "$s" ] && { bash "$s" --install; break; }
done
```

Idempotente: rodar de novo com tudo pronto não muda nada e sai 0. Sem `--install`, só relata.

Exit codes: **0** pronto · **1** falta algo mas dá para instalar · **2** falta algo e não dá
(sem `curl`, sem `git`, ou a rede não responde).

Saída de máquina, para quando o agente precisa decidir sozinho:

```bash
bash scripts/plannotator-setup.sh --json
# {"binario":"ok","versao":"0.27.6","render_skill":"ok","visual_explainer":"ok",
#  "invocacao_modelo":"liberada","agent_dirs":7,"com_render":7,"com_ve":7,"exit":0}
```

## As quatro peças

Nenhuma sobra. Faltando qualquer uma, a entrega não acontece.

| Peça | O que é | Onde vive |
|---|---|---|
| **Binário** | `plannotator` — servidor local + UI de anotação, instalado em modo `--minimal` | `~/.local/bin/plannotator` |
| **Skill de render** | `plannotator-visual-explainer` — roteia o conteúdo e aplica o tema | `~/.agents/skills/` + symlink em cada agent skill dir |
| **Skill de composição** | `visual-explainer` (nicobailon) — a que de fato escreve o HTML na rota "todo o resto" | idem |
| **Destrave** | remoção de `disable-model-invocation: true` do SKILL.md instalado | no arquivo da skill de render |

### Por que o destrave é obrigatório

A `plannotator-visual-explainer` chega com `disable-model-invocation: true` no frontmatter — de
propósito: o Plannotator quer que a **pessoa** peça. Só que o contrato desta skill é delegar
sozinha. Travada, a instrução "invoque a skill de render" vira uma ordem que ninguém pode cumprir, e
o agente cai no fallback silencioso de escrever HTML na mão — exatamente o que se quis eliminar.

O `plannotator-setup.sh --install` remove essa linha da **cópia instalada** (nunca do repositório de
origem) e ajusta `agents/openai.yaml` (`allow_implicit_invocation: true`) quando existe. O
instalador oficial faz o mesmo por `--model-invocable plannotator-visual-explainer`.

### Por que `--minimal`

O `plannotator-setup.sh` chama o instalador oficial com `--minimal`, e isso é deliberado. Uma
instalação **completa** não para no binário: ela roda varreduras de migração que dão `rm -rf` em
`plannotator-compound`, `plannotator-setup-goal` e **`plannotator-visual-explainer`** dentro de
`~/.claude/skills` e `~/.agents/skills` — inclusive na cópia que este script acabou de instalar — e
escreve hooks e configuração em cinco harnesses (`~/.claude/settings.json`, `$CODEX_HOME`,
`~/.gemini`, `~/.kiro`, `~/.config/opencode`). Esta skill precisa do **binário**; ela não tem mandato
para reescrever a configuração dos agentes de ninguém.

Quem quiser a integração completa pede explicitamente:

```bash
HX_PLANNOTATOR_FULL=1 bash scripts/plannotator-setup.sh --install
```

E aceite a consequência: se você tinha as skills extras instaladas por outro caminho, a varredura
pode apagá-las.

### Marca de autoria, e o que `--uninstall` recusa

Toda cópia que este script instala recebe um arquivo `.installed-by-html-explainer`. O
`--uninstall` só apaga o que tem essa marca, e só remove o symlink que aponta para o **nosso**
canônico. Uma `plannotator-visual-explainer` que você instalou por `npx skills add` e editou
sobrevive — com uma nota dizendo que foi preservada. Pelo mesmo motivo, o `--install` **não**
sobrescreve um destino sem a marca.

### Por que não `npx skills add`

É o caminho que a documentação do Plannotator indica
(`npx skills add backnotprop/plannotator/apps/skills/extra --global`), mas ele **abre uma UI
interativa** para escolher agentes e trava sem TTY — e um agente roda sem TTY. O
`plannotator-setup.sh` faz `git sparse-checkout` da mesma pasta, na tag que casa com a versão do
binário instalado. Determinístico, sem teclado.

## Todos os agent skill dirs ("asd")

A lista canônica está em `scripts/agent-dirs.sh` — **fonte única**, lida tanto pelo `install.sh` do
repositório quanto pelo `plannotator-setup.sh`. Duas listas divergindo é como uma skill fica
instalada num harness e invisível no outro.

O primeiro item, `~/.agents/skills`, é o **canônico**: recebe a cópia real. Todos os outros recebem
**symlink** para ele — uma cópia só, N pontos de entrada, e atualizar o canônico vale na hora em
todos. Diretório que não existe é **pulado**, nunca criado.

A lista é **descoberta**, não escrita à mão:

- `~/.agents/skills` (canônico) e `~/.claude/skills`;
- `$CLAUDE_CONFIG_DIR/skills`, quando a variável está definida;
- **todo** `~/.claude-*/skills` que existir — é assim que o **dsh** (`~/.claude-deepseek/skills`) e
  qualquer perfil extra de Claude Code entram sozinhos, sem nome de pessoa versionado;
- `~/.codex/skills` · `~/.copilot/skills` · `${XDG_CONFIG_HOME:-~/.config}/opencode/skill` ·
  `~/.gemini/skills` · `~/.cursor/skills` · `~/.kiro/skills`.

Um diretório exótico entra por `HX_EXTRA_AGENT_DIRS`, separado por `:`. Perfil de Claude Code novo
não precisa de nada: é só rodar `--install` de novo.

## Instalação manual, quando o script não serve

```bash
# 1. binário (nunca sudo, nunca npm -g; instala em ~/.local/bin)
curl -fsSL https://plannotator.ai/install.sh | bash -s -- --non-interactive

# 1b. só o binário, sem tocar em nenhuma config de agente
curl -fsSL https://plannotator.ai/install.sh | bash -s -- --minimal --non-interactive

# 2. as skills extras, com TTY disponível
npx skills add backnotprop/plannotator/apps/skills/extra --global
npx skills add nicobailon/visual-explainer -g --yes

# 3. destravar a invocação pelo modelo
curl -fsSL https://plannotator.ai/install.sh \
  | bash -s -- --non-interactive --extras --model-invocable plannotator-visual-explainer

# 4. conferir
plannotator --version
plannotator annotate        # imprime o usage e sai; não abre navegador
```

Flags do instalador que importam: `--minimal` (só o binário) · `--extras` / `--no-extras` ·
`--model-invocable <lista>|none` · `--skip-codex` `--skip-gemini` `--skip-kiro` `--skip-opencode`
`--skip-skills` · `--version vX.Y.Z` · `--non-interactive` · `--reconfigure`.

Desinstalar: `plannotator uninstall [--purge]` para o binário e as integrações oficiais;
`plannotator-setup.sh --uninstall` só para o que **este** script criou (as duas skills e seus
symlinks — não encosta no binário).

## Configuração que vale a pena

Variáveis de ambiente do próprio Plannotator:

| Variável | Para quê |
|---|---|
| `PLANNOTATOR_REMOTE=0` | mantém o servidor em `127.0.0.1`. **Leia o aviso abaixo.** |
| `PLANNOTATOR_PORT` | porta fixa (default: aleatória local, 19432 em remoto) |
| `PLANNOTATOR_BROWSER` | navegador que abre a UI |
| `PLANNOTATOR_SHARE=disabled` | desliga o link de compartilhamento externo |
| `PLANNOTATOR_AI=disabled` | desliga "Ask AI" e os agentes de review dentro da UI |
| `PLANNOTATOR_ORIGIN` | sobrescreve a detecção de harness (só cosmético na UI) |
| `PLANNOTATOR_DATA_DIR` | onde ficam planos, histórico e rascunhos |

Do lado desta skill: `HX_PLANNOTATOR_BIN` (executável explícito) · `HX_PLANNOTATOR_INSTALL=0`
(proíbe instalar o binário) · `HX_PLANNOTATOR_FULL=1` (integração completa, com as ressalvas acima) ·
`HX_PLANNOTATOR_VERSION` (fixa a versão) · `HX_SKILLS_REF` e `HX_VE_REF` (refs das skills) ·
`HX_PLANNOTATOR_REPO` e `HX_VE_REPO` (fork ou espelho) · `HX_INSTALL_URL` · `HX_EXTRA_AGENT_DIRS`.

> **O binário vem de `curl | bash`.** O instalador oficial confere o SHA256 do que baixa, e o
> `--verify-attestation` dele exige a proveniência SLSA por `gh attestation verify`. Se a sua
> política não aceita instalar assim, instale o binário à mão (seção acima), aponte
> `HX_PLANNOTATOR_BIN` para ele e rode o setup com `HX_PLANNOTATOR_INSTALL=0`: as duas skills ainda
> são buscadas por `git`, e nada é baixado por pipe.
>
> **A skill de composição (`visual-explainer`) é clonada de `main`, sem pin.** É código de terceiro
> que passa a ser lido por todos os seus agentes. Para travar numa revisão que você auditou:
> `HX_VE_REF=<sha> bash scripts/plannotator-setup.sh --install`.

> **Aviso de segurança, herdado do deep-orchestrator:** em qualquer shell com `SSH_TTY` ou
> `SSH_CONNECTION` no ambiente — o caso normal de servidor de desenvolvimento — o Plannotator passa
> a escutar em `0.0.0.0:19432`. O endpoint de aprovação **não tem autenticação**: quem alcançar a
> máquina lê o documento e pode aprová-lo por você. Para revisar por SSH, use túnel:
> `ssh -L 19432:127.0.0.1:19432 <host>`.

## Quando dá errado

| Sintoma | Causa provável | Conserto |
|---|---|---|
| `plannotator: command not found` dentro do agente | `~/.local/bin` fora do `PATH` de shell não-interativo | chame pelo caminho absoluto, ou exporte `HX_PLANNOTATOR_BIN` |
| A skill de render "não existe" | instalada mas ainda travada | `plannotator-setup.sh --install` e confira `invocacao_modelo: liberada` |
| Instalador morre no meio do download | `/tmp` pequeno — o binário é single-file Bun de ~150 MB | `TMPDIR=~/.cache bash …` |
| `clone falhou` no setup | rede, ou a tag `v<versão>` não existe no repo | o script já cai para o branch padrão; force com `HX_SKILLS_REF=main` |
| Instalou como root | o instalador não tem guarda de EUID; foi para `/root/.local/bin` | instale como o usuário de verdade |
| Navegador não abre | sessão sem display | `plannotator sessions --open 1`, ou `PLANNOTATOR_BROWSER` |
| Diagrama sai com `Syntax error in text` | Mermaid inválido | é gate duro: conserte e re-renderize nas duas paletas antes de abrir a UI |
