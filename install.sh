#!/usr/bin/env bash
#
# install.sh — liga a skill deste repositório aos agentes de código instalados,
# e garante o Plannotator, que é quem renderiza e entrega o resultado dela.
#
# Não copia nada: cria um symlink em cada diretório de agente, apontando para a
# pasta aqui dentro. Editar o SKILL.md no repo passa a valer na hora, em todos
# os agentes, sem passo de deploy.
#
#   ./install.sh                instala/atualiza os links + garante o Plannotator
#   ./install.sh --check        só relata o que faria
#   ./install.sh --no-plannotator   só os links (pula o setup do Plannotator)
#   ./install.sh --uninstall    remove os links (nunca toca em diretório real)
#
set -euo pipefail

# pwd -P (físico) porque a comparação lá embaixo usa readlink -f, que também é
# físico: com um symlink no meio do caminho do repo, lógico != físico e NENHUM
# link existente seria reconhecido — o instalador relataria "criei" para sempre.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SKILLS=(html-explainer-agent-skill)

# A lista dos agent skill dirs é a MESMA que o plannotator-setup.sh usa — uma
# fonte única. Duas listas divergindo é como uma skill fica instalada num
# harness e invisível no outro.
# shellcheck source=html-explainer-agent-skill/scripts/agent-dirs.sh
source "$REPO/html-explainer-agent-skill/scripts/agent-dirs.sh"

# O canônico é o único diretório que este instalador CRIA. Sem isto, numa
# máquina que ainda não tem ~/.agents/skills, o laço abaixo o pularia; o
# plannotator-setup.sh o criaria minutos depois, para as skills de terceiros; e
# o caminho que o SKILL.md manda o agente rodar no passo 0 não existiria — exit
# 127, que o procedimento não sabe tratar. Bug de ordem clássico, invisível em
# qualquer máquina onde o diretório já exista.
[[ "${1:-}" == "--check" || "${1:-}" == "--dry-run" ]] || mkdir -p "$AGENT_DIRS_CANONICAL"

MODE=install
WITH_PLANNOTATOR=1
for arg in "$@"; do
  case "$arg" in
    --check|--dry-run)  MODE=check ;;
    --uninstall)        MODE=uninstall ;;
    --no-plannotator)   WITH_PLANNOTATOR=0 ;;
    -h|--help)
      sed -n '3,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "argumento desconhecido: $arg (use --help)" >&2; exit 2 ;;
  esac
done

green()  { printf '\033[32m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }
red()    { printf '\033[31m%s\033[0m\n' "$1"; }

linked=0; skipped=0; removed=0; problems=0

for dir in "${AGENT_DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  for skill in "${SKILLS[@]}"; do
    target="$REPO/$skill"
    link="$dir/$skill"

    if [[ "$MODE" == uninstall ]]; then
      if [[ -L "$link" ]]; then
        rm "$link"; removed=$((removed + 1)); echo "  removido  $link"
      elif [[ -e "$link" ]]; then
        yellow "  !! $link é um diretório REAL — não removido"
        problems=$((problems + 1))
      fi
      continue
    fi

    # Nunca sobrescrever um diretório de verdade: pode ser skill instalada por outro caminho.
    if [[ -e "$link" && ! -L "$link" ]]; then
      yellow "  !! $link é um diretório REAL — pulado (mova ou apague antes)"
      problems=$((problems + 1))
      continue
    fi

    current="$([[ -L "$link" ]] && readlink -f "$link" || true)"
    if [[ "$current" == "$(readlink -f "$target" 2>/dev/null || printf '%s' "$target")" ]]; then
      skipped=$((skipped + 1)); echo "  ok        $link"
      continue
    fi

    if [[ "$MODE" == check ]]; then
      echo "  criaria   $link -> $target"
      linked=$((linked + 1))
      continue
    fi

    ln -sfn "$target" "$link"
    linked=$((linked + 1))
    echo "  ligado    $link -> $target"
  done
done

echo
case "$MODE" in
  uninstall) green "$removed link(s) removido(s)."
             echo "As skills do Plannotator continuam instaladas. Para tirá-las:"
             echo "  bash $REPO/html-explainer-agent-skill/scripts/plannotator-setup.sh --uninstall"
             exit 0 ;;
  check)     green "$linked a criar, $skipped já corretos. (nada foi alterado)" ;;
  *)         green "$linked link(s) criado(s)/atualizado(s), $skipped já corretos." ;;
esac
(( problems > 0 )) && yellow "$problems caminho(s) exigem atenção (ver acima)."

if [[ "$MODE" == install ]]; then
  # Prova de que o link resolve de verdade — symlink quebrado passa despercebido.
  fail=0
  for dir in "${AGENT_DIRS[@]}"; do
    [[ -d "$dir" ]] || continue
    for skill in "${SKILLS[@]}"; do
      [[ -L "$dir/$skill" ]] || continue
      [[ -f "$dir/$skill/SKILL.md" ]] || { red "  link quebrado: $dir/$skill"; fail=1; }
    done
  done
  (( fail == 0 )) && green "Todos os links resolvem até um SKILL.md."
fi

# ---------------------------------------------------------------------------
# O Plannotator não é opcional: a skill delega a renderização para ele. Sem
# isso, instalar a skill entrega um SKILL.md que não consegue cumprir o próprio
# procedimento — o pior tipo de instalação bem-sucedida.
# ---------------------------------------------------------------------------
SETUP="$REPO/html-explainer-agent-skill/scripts/plannotator-setup.sh"

# O status de saída é o veredito. Sair 0 depois de pular link ou de falhar o
# setup faria um `./install.sh && echo pronto` mentir em CI.
rc=0
(( problems > 0 )) && rc=1

if (( WITH_PLANNOTATOR )); then
  echo
  case "$MODE" in
    check)   bash "$SETUP" || true ;;
    install) if ! bash "$SETUP" --install; then
               rc=$?
               yellow "O setup do Plannotator não completou (exit $rc). Leia:"
               yellow "  $REPO/html-explainer-agent-skill/references/plannotator.md"
             fi ;;
  esac
else
  echo
  yellow "Plannotator pulado (--no-plannotator). A skill NÃO entrega sem ele:"
  echo "  bash $SETUP --install"
fi

exit "$rc"
