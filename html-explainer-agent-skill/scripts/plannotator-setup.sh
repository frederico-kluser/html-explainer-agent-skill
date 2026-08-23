#!/usr/bin/env bash
# =============================================================================
# plannotator-setup.sh — garante o Plannotator e a skill de renderização
# -----------------------------------------------------------------------------
# Esta skill NÃO desenha mais nada por conta própria: ela escreve o BRIEF
# DIDÁTICO e entrega a renderização para a skill `plannotator-visual-explainer`.
# Este script é o que torna essa entrega possível em qualquer harness da
# máquina — e o que faz a skill se autoinstalar quando o Plannotator falta.
#
# Uso:
#   plannotator-setup.sh                 relata o estado (não escreve nada)
#   plannotator-setup.sh --install       instala/repara o que faltar
#   plannotator-setup.sh --json          saída de máquina
#   plannotator-setup.sh --uninstall     remove só o que ESTE script instalou
#
# Exit codes (iguais em --check e --install, medidos DEPOIS de agir):
#   0 PRONTO       binário + skill de render + invocação pelo modelo liberada
#   1 INSTALÁVEL   falta algo, mas dá para instalar (curl e git de pé)
#   2 IMPOSSÍVEL   falta algo e NÃO dá para instalar aqui
#
# O QUE ESTE SCRIPT ESCREVE, e nada além disso:
#   ~/.local/bin/plannotator                     via instalador oficial em modo
#                                                --minimal: SÓ o binário, sem
#                                                encostar em ~/.claude, ~/.codex,
#                                                ~/.gemini, ~/.kiro nem opencode
#   $CANÔNICO/plannotator-visual-explainer/      cópia real + marca de autoria
#   $CANÔNICO/visual-explainer/                  idem
#   <cada agent skill dir>/<as duas acima>       symlink para o canônico
#
# --minimal é DELIBERADO. Uma instalação COMPLETA do Plannotator roda varreduras
# de migração que dão `rm -rf` em skills dentro de ~/.claude/skills e
# ~/.agents/skills (inclusive na plannotator-visual-explainer que este script
# acabou de instalar) e escreve hooks e config em cinco harnesses. Esta skill não
# tem mandato para reescrever a configuração dos agentes de ninguém: ela precisa
# do binário. Quem QUISER a integração completa pede: HX_PLANNOTATOR_FULL=1.
# Nunca sudo. Nunca npm -g. Nunca sobrescreve o que não instalou.
#
# Ambiente:
#   HX_PLANNOTATOR_BIN        caminho explícito do executável (vence o PATH)
#   HX_PLANNOTATOR_INSTALL=0  proíbe instalar o binário mesmo com --install
#   HX_PLANNOTATOR_FULL=1     instalação COMPLETA (com as ressalvas acima)
#   HX_PLANNOTATOR_VERSION    fixa a versão do binário (ex.: v0.27.6)
#   HX_SKILLS_REF             ref do repo do Plannotator (default: a versão do
#                             binário instalado; cai para "main")
#   HX_VE_REF                 ref de nicobailon/visual-explainer (default main)
#   HX_PLANNOTATOR_REPO       origem da skill de render (fork/espelho/file://)
#   HX_VE_REPO                origem da skill de composição
#   HX_INSTALL_URL            override do instalador oficial
# @help-end
# =============================================================================

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=agent-dirs.sh
source "$HERE/agent-dirs.sh"

INSTALL_URL="${HX_INSTALL_URL:-https://plannotator.ai/install.sh}"
BIN_DIR="$HOME/.local/bin"
CANON="$AGENT_DIRS_CANONICAL"

PLANNOTATOR_REPO="${HX_PLANNOTATOR_REPO:-https://github.com/backnotprop/plannotator.git}"
PLANNOTATOR_SKILL_PATH="apps/skills/extra/plannotator-visual-explainer"
VE_REPO="${HX_VE_REPO:-https://github.com/nicobailon/visual-explainer.git}"
VE_SKILL_PATH="plugins/visual-explainer"

# A marca de autoria. Sem ela, --uninstall não sabe distinguir a cópia que ESTE
# script instalou da cópia que a pessoa instalou por `npx skills add` e editou —
# e apagar a segunda é perda irreversível, não um download a refazer.
MARK=".installed-by-html-explainer"

MODE=check
JSON=0
for arg in "$@"; do
  case "$arg" in
    --install)   MODE=install ;;
    --check)     MODE=check ;;
    --uninstall) MODE=uninstall ;;
    --json)      JSON=1 ;;
    -h|--help)   sed -n '3,/@help-end/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//; /@help-end/d'; exit 0 ;;
    *) echo "argumento desconhecido: $arg (use --help)" >&2; exit 2 ;;
  esac
done

say()  { [[ "$JSON" == 1 ]] || printf '%s\n' "$1"; }
warn() { printf '%s\n' "$1" >&2; }

BIN_PATH=""
BIN_VERSION=""
STATE_BIN="ausente"
STATE_RENDER="ausente"
STATE_VE="ausente"
STATE_UNLOCK="travada"
NOTES=()

# --- binário -----------------------------------------------------------------
resolve_bin() {
  if [[ -n "${HX_PLANNOTATOR_BIN:-}" && -x "${HX_PLANNOTATOR_BIN}" ]]; then
    BIN_PATH="$HX_PLANNOTATOR_BIN"; return 0
  fi
  local cand
  if cand="$(command -v plannotator 2>/dev/null)" && [[ -n "$cand" ]]; then
    BIN_PATH="$cand"; return 0
  fi
  # ~/.local/bin quase nunca está no PATH de shell não-interativo; é o destino
  # padrão do instalador oficial, então procuramos lá explicitamente.
  if [[ -x "$BIN_DIR/plannotator" ]]; then BIN_PATH="$BIN_DIR/plannotator"; return 0; fi
  return 1
}

probe_bin() {
  # `plannotator annotate` SEM argumento imprime o usage e sai — não abre
  # navegador, não sobe servidor. É a sonda de capacidade: prova que o binário
  # roda de verdade, e não só que existe um arquivo com esse nome.
  local usage
  usage="$("$BIN_PATH" annotate 2>&1 </dev/null)"
  [[ "$usage" == *"annotate"* ]]
}

install_bin() {
  if [[ "${HX_PLANNOTATOR_INSTALL:-1}" == "0" ]]; then
    NOTES+=("instalação do binário proibida por HX_PLANNOTATOR_INSTALL=0"); return 1
  fi
  if [[ "$(id -u)" == "0" ]]; then
    NOTES+=("recuso instalar como root: iria para /root/.local/bin"); return 1
  fi
  command -v curl >/dev/null 2>&1 || { NOTES+=("curl ausente"); return 1; }

  local args=(--non-interactive)
  if [[ "${HX_PLANNOTATOR_FULL:-0}" == "1" ]]; then
    args+=(--no-minimal --no-extras --model-invocable none)
    say "Instalando o Plannotator COMPLETO (HX_PLANNOTATOR_FULL=1): hooks e config"
    say "em ~/.claude, ~/.codex, ~/.gemini, ~/.kiro e opencode também serão escritos."
  else
    args+=(--minimal)
    say "Instalando o Plannotator (modo --minimal: só o binário em $BIN_DIR)..."
  fi
  [[ -n "${HX_PLANNOTATOR_VERSION:-}" ]] && args+=(--version "$HX_PLANNOTATOR_VERSION")

  # PLANNOTATOR_MINIMAL=1 é cinto de segurança: se a versão do instalador ainda
  # não conhecer a flag, a variável de ambiente segura o mesmo comportamento.
  local env_minimal=1
  [[ "${HX_PLANNOTATOR_FULL:-0}" == "1" ]] && env_minimal=0
  PLANNOTATOR_MINIMAL="$env_minimal" curl -fsSL --max-time 600 "$INSTALL_URL" \
    | bash -s -- "${args[@]}" >&2
}

# --- skills por git sparse-checkout ------------------------------------------
# Não usamos `npx skills add`: ele abre uma UI interativa para escolher agentes
# e trava sem TTY. Sparse-checkout é determinístico e roda em qualquer lugar.
fetch_skill() {
  local repo="$1" path="$2" ref="$3" dest="$4" tmp
  command -v git >/dev/null 2>&1 || { NOTES+=("git ausente: não dá para buscar as skills"); return 1; }
  tmp="$(mktemp -d)" || return 1
  local ok=1
  if git clone --quiet --filter=blob:none --no-checkout --depth 1 --branch "$ref" "$repo" "$tmp/r" 2>/dev/null; then
    ok=0
  elif git clone --quiet --filter=blob:none --no-checkout --depth 1 "$repo" "$tmp/r" 2>/dev/null; then
    NOTES+=("ref '$ref' não existe em $repo; usei o branch padrão")
    ok=0
  fi
  if (( ok != 0 )); then rm -rf "$tmp"; NOTES+=("clone falhou: $repo"); return 1; fi
  git -C "$tmp/r" sparse-checkout init --cone >/dev/null 2>&1
  git -C "$tmp/r" sparse-checkout set "$path" >/dev/null 2>&1
  git -C "$tmp/r" checkout --quiet >/dev/null 2>&1
  if [[ ! -f "$tmp/r/$path/SKILL.md" ]]; then
    rm -rf "$tmp"; NOTES+=("$path/SKILL.md não veio no checkout de $repo"); return 1
  fi
  mkdir -p "$(dirname "$dest")"
  # Só apagamos um destino que já é nosso. Um diretório sem a marca foi
  # instalado por outro caminho e pode ter edições locais.
  if [[ -e "$dest" && ! -f "$dest/$MARK" ]]; then
    rm -rf "$tmp"
    NOTES+=("$dest existe e não foi instalado por este script — deixei como está")
    return 1
  fi
  rm -rf "$dest"
  cp -R "$tmp/r/$path" "$dest"
  printf 'html-explainer-agent-skill\nrepo=%s\nref=%s\n' "$repo" "$ref" > "$dest/$MARK"
  rm -rf "$tmp"
  return 0
}

# Remove a trava que impede o MODELO de invocar a skill. Ela chega travada de
# propósito (o Plannotator quer que a pessoa peça), mas o contrato desta skill
# é justamente delegar a renderização sozinha — sem destravar, a delegação vira
# uma instrução que ninguém pode cumprir.
unlock_model_invocation() {
  local md="$1/SKILL.md"
  [[ -f "$md" ]] || return 1
  if grep -q '^disable-model-invocation: true$' "$md"; then
    grep -v '^disable-model-invocation: true$' "$md" > "$md.tmp" && mv "$md.tmp" "$md"
  fi
  local sidecar="$1/agents/openai.yaml"
  if [[ -f "$sidecar" ]] && grep -q 'allow_implicit_invocation: false' "$sidecar"; then
    sed 's/allow_implicit_invocation: false/allow_implicit_invocation: true/' "$sidecar" > "$sidecar.tmp" \
      && mv "$sidecar.tmp" "$sidecar"
  fi
  ! grep -q '^disable-model-invocation: true$' "$md"
}

# Espalha o canônico para os outros agent skill dirs por symlink. Uma cópia só,
# N pontos de entrada: atualizar o canônico vale na hora em todo lugar.
fanout() {
  local name="$1" made=0 d link
  local target="$CANON/$name"
  [[ -d "$target" ]] || return 1
  while read -r d; do
    [[ "$d" == "$CANON" ]] && continue
    link="$d/$name"
    if [[ -e "$link" && ! -L "$link" ]]; then
      NOTES+=("$link é um diretório REAL — deixei como está")
      continue
    fi
    if [[ -L "$link" ]]; then
      local atual; atual="$(readlink -f "$link" 2>/dev/null || true)"
      [[ "$atual" == "$(readlink -f "$target")" ]] && continue
      # Symlink apontando para outro lugar é escolha de alguém — um fork, um
      # checkout de trabalho. Trocar em silêncio é o pior desfecho possível.
      NOTES+=("$link aponta para ${atual:-alvo inexistente} — deixei como está")
      continue
    fi
    ln -sfn "$target" "$link" && made=$((made+1))
  done < <(agent_dirs_present)
  (( made > 0 )) && say "  espalhado para $made agent skill dir(s): $name"
  return 0
}

count_linked() {
  local name="$1" n=0 d
  while read -r d; do
    [[ -f "$d/$name/SKILL.md" ]] && n=$((n+1))
  done < <(agent_dirs_present)
  printf '%s' "$n"
}

# --- avaliação ---------------------------------------------------------------
evaluate() {
  STATE_BIN="ausente"; STATE_RENDER="ausente"; STATE_VE="ausente"; STATE_UNLOCK="travada"
  BIN_PATH=""; BIN_VERSION=""
  if resolve_bin; then
    BIN_VERSION="$("$BIN_PATH" --version 2>/dev/null | tr -dc '0-9.' )"
    if probe_bin; then STATE_BIN="ok"; else STATE_BIN="quebrado"; fi
  fi
  [[ -f "$CANON/plannotator-visual-explainer/SKILL.md" ]] && STATE_RENDER="ok"
  [[ -f "$CANON/visual-explainer/SKILL.md" ]] && STATE_VE="ok"
  if [[ "$STATE_RENDER" == ok ]] \
     && ! grep -q '^disable-model-invocation: true$' "$CANON/plannotator-visual-explainer/SKILL.md"; then
    STATE_UNLOCK="liberada"
  fi
  [[ "$STATE_BIN" == ok && "$STATE_RENDER" == ok && "$STATE_VE" == ok && "$STATE_UNLOCK" == liberada ]]
}

do_uninstall() {
  local name d removed=0 kept=0
  for name in plannotator-visual-explainer visual-explainer; do
    local target="$CANON/$name"
    while read -r d; do
      [[ "$d" == "$CANON" ]] && continue
      local link="$d/$name"
      [[ -L "$link" ]] || continue
      # Só o symlink que aponta para o NOSSO canônico é nosso.
      if [[ "$(readlink -f "$link" 2>/dev/null || true)" == "$(readlink -f "$target" 2>/dev/null || true)" ]]; then
        rm "$link"; removed=$((removed+1))
      else
        NOTES+=("$link aponta para outro lugar — deixei como está"); kept=$((kept+1))
      fi
    done < <(agent_dirs_present)
    if [[ -d "$target" && ! -L "$target" ]]; then
      if [[ -f "$target/$MARK" ]]; then
        rm -rf "$target"; removed=$((removed+1))
      else
        NOTES+=("$target não foi instalado por este script — deixei como está")
        kept=$((kept+1))
      fi
    fi
  done
  if [[ "$JSON" == 1 ]]; then
    printf '{"removidos":%s,"preservados":%s,"binario":"intocado"}\n' "$removed" "$kept"
  else
    say "$removed caminho(s) removido(s), $kept preservado(s)."
    for n in "${NOTES[@]+"${NOTES[@]}"}"; do say "  nota: $n"; done
    say "O binário do Plannotator NÃO foi tocado — para removê-lo: plannotator uninstall"
  fi
  exit 0
}

[[ "$MODE" == uninstall ]] && do_uninstall

evaluate

if [[ "$MODE" == install ]]; then
  if [[ "$STATE_BIN" != ok ]]; then
    install_bin
    # Re-avalia DEPOIS de instalar: o instalador pode ter mexido no que já
    # existia, e decidir com o retrato anterior é decidir com dado velho.
    evaluate
  fi
  # A ref das skills segue a versão do binário: skill nova com binário velho é
  # como se descobre, em produção, que uma flag ainda não existe.
  ref="${HX_SKILLS_REF:-}"
  if [[ -z "$ref" ]]; then
    ref="${BIN_VERSION:+v$BIN_VERSION}"; ref="${ref:-main}"
  fi
  if [[ "$STATE_RENDER" != ok ]]; then
    say "Buscando a skill de renderização (plannotator-visual-explainer @ $ref)..."
    fetch_skill "$PLANNOTATOR_REPO" "$PLANNOTATOR_SKILL_PATH" "$ref" "$CANON/plannotator-visual-explainer" \
      && STATE_RENDER=ok
  fi
  if [[ "$STATE_VE" != ok ]]; then
    say "Buscando a skill de composição (nicobailon/visual-explainer @ ${HX_VE_REF:-main})..."
    fetch_skill "$VE_REPO" "$VE_SKILL_PATH" "${HX_VE_REF:-main}" "$CANON/visual-explainer" \
      && STATE_VE=ok
  fi
  if [[ "$STATE_RENDER" == ok ]]; then
    unlock_model_invocation "$CANON/plannotator-visual-explainer" && STATE_UNLOCK=liberada
    fanout plannotator-visual-explainer
  fi
  [[ "$STATE_VE" == ok ]] && fanout visual-explainer
  evaluate
fi

# --- relatório ---------------------------------------------------------------
n_render="$(count_linked plannotator-visual-explainer)"
n_ve="$(count_linked visual-explainer)"
n_dirs="$(agent_dirs_present | wc -l)"

# "Instalável" não é "curl e git existem": é "o que está FALTANDO pode ser
# buscado daqui". Binário ausente com instalação proibida não é instalável por
# mais curl que haja no PATH — e dizer 1 nesse caso manda a pessoa rodar um
# --install que já se sabe que não vai resolver.
installable() {
  if [[ "$STATE_BIN" != ok ]]; then
    if [[ "${HX_PLANNOTATOR_INSTALL:-1}" == "0" ]]; then
      NOTES+=("binário ausente e instalação proibida (HX_PLANNOTATOR_INSTALL=0)"); return 1
    fi
    command -v curl >/dev/null 2>&1 || { NOTES+=("binário ausente e curl fora do PATH"); return 1; }
  fi
  if [[ "$STATE_RENDER" != ok || "$STATE_VE" != ok ]]; then
    command -v git >/dev/null 2>&1 || { NOTES+=("skill ausente e git fora do PATH"); return 1; }
  fi
  return 0
}

if evaluate; then code=0
elif installable; then code=1
else code=2; fi

if [[ "$JSON" == 1 ]]; then
  printf '{"binario":"%s","versao":"%s","caminho":"%s","render_skill":"%s","visual_explainer":"%s","invocacao_modelo":"%s","agent_dirs":%s,"com_render":%s,"com_ve":%s,"exit":%s}\n' \
    "$STATE_BIN" "$BIN_VERSION" "$BIN_PATH" "$STATE_RENDER" "$STATE_VE" "$STATE_UNLOCK" \
    "$n_dirs" "$n_render" "$n_ve" "$code"
else
  say ""
  say "Plannotator ......... $STATE_BIN${BIN_VERSION:+ (v$BIN_VERSION em $BIN_PATH)}"
  say "Skill de render ..... $STATE_RENDER   (plannotator-visual-explainer)"
  say "Skill de composição . $STATE_VE   (visual-explainer, nicobailon)"
  say "Invocável pelo modelo $STATE_UNLOCK"
  say "Agent skill dirs .... $n_dirs presentes · $n_render com a skill de render · $n_ve com a de composição"
  for n in "${NOTES[@]+"${NOTES[@]}"}"; do say "  nota: $n"; done
  case "$code" in
    0) say ""; say "PRONTO. A skill pode delegar a renderização." ;;
    1) say ""; say "FALTA COISA — rode: $0 --install" ;;
    2) say ""; say "IMPOSSÍVEL instalar daqui (falta curl ou git, ou a rede não responde)."
       say "Instruções manuais: references/plannotator.md" ;;
  esac
fi
exit "$code"
