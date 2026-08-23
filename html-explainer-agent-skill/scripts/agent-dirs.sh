#!/usr/bin/env bash
# =============================================================================
# agent-dirs.sh — os "asd" (agent skill dirs) desta máquina, DESCOBERTOS.
# -----------------------------------------------------------------------------
# FONTE ÚNICA. Quem precisa saber onde uma skill fica visível para um agente lê
# daqui: o install.sh do repositório e o plannotator-setup.sh da skill. Duas
# listas divergindo é como uma skill fica instalada num harness e invisível no
# outro — o bug que ninguém investiga porque "instalei, tá lá".
#
# A lista é DESCOBERTA, não escrita à mão: além dos caminhos padrão de cada
# harness, o glob $HOME/.claude-*/skills pega qualquer perfil extra de Claude
# Code (que é o que CLAUDE_CONFIG_DIR aponta quando alguém roda mais de uma
# conta na mesma máquina). Assim um perfil novo entra sozinho, e nenhum nome de
# pessoa precisa ser versionado num repositório público.
#
# Uso:
#   source "$(dirname "$0")/agent-dirs.sh"
#   for d in "${AGENT_DIRS[@]}"; do ... done   # candidatos, existindo ou não
#   agent_dirs_present                          # só os que existem, um por linha
#
# Ambiente:
#   CLAUDE_CONFIG_DIR      perfil ativo do Claude Code; entra na lista
#   HX_EXTRA_AGENT_DIRS    diretórios adicionais, separados por ':'
#
# O primeiro item é o CANÔNICO: é onde as skills de terceiros são instaladas de
# verdade; os outros recebem symlink apontando para lá. ~/.agents/skills é o
# diretório compartilhado que o próprio instalador do Plannotator já usa para
# "shared agent skills", e é lido por mais de um harness.
# =============================================================================

AGENT_DIRS_CANONICAL="$HOME/.agents/skills"

_hx_add_dir() {
  # Um candidato só entra uma vez. Sem isto, CLAUDE_CONFIG_DIR=~/.claude e o
  # caminho padrão viram duas entradas, e o install.sh relata o dobro do que fez.
  local cand="$1" seen
  [[ -n "$cand" ]] || return 0
  for seen in "${AGENT_DIRS[@]+"${AGENT_DIRS[@]}"}"; do
    [[ "$seen" == "$cand" ]] && return 0
  done
  AGENT_DIRS+=("$cand")
}

AGENT_DIRS=()
_hx_add_dir "$AGENT_DIRS_CANONICAL"          # compartilhado (CANÔNICO)
_hx_add_dir "$HOME/.claude/skills"           # Claude Code — perfil padrão
[[ -n "${CLAUDE_CONFIG_DIR:-}" ]] && _hx_add_dir "$CLAUDE_CONFIG_DIR/skills"

# Perfis extras de Claude Code: ~/.claude-deepseek (o harness dsh), ~/.claude-<conta>,
# etc. Glob sem match não expande, então o literal é descartado aqui mesmo.
for _hx_d in "$HOME"/.claude-*/skills; do
  [[ -d "$_hx_d" ]] && _hx_add_dir "$_hx_d"
done
unset _hx_d

_hx_add_dir "$HOME/.codex/skills"
_hx_add_dir "$HOME/.copilot/skills"
_hx_add_dir "${XDG_CONFIG_HOME:-$HOME/.config}/opencode/skill"
_hx_add_dir "$HOME/.gemini/skills"
_hx_add_dir "$HOME/.cursor/skills"
_hx_add_dir "$HOME/.kiro/skills"

if [[ -n "${HX_EXTRA_AGENT_DIRS:-}" ]]; then
  IFS=':' read -r -a _hx_extra <<< "$HX_EXTRA_AGENT_DIRS"
  for _hx_d in "${_hx_extra[@]+"${_hx_extra[@]}"}"; do _hx_add_dir "$_hx_d"; done
  unset _hx_d _hx_extra
fi

# Diretórios que EXISTEM agora, na ordem acima. Imprime um por linha.
agent_dirs_present() {
  local d
  for d in "${AGENT_DIRS[@]}"; do
    [[ -d "$d" ]] && printf '%s\n' "$d"
  done
  return 0
}
