#!/usr/bin/env bash
# Vigia a Fase 0 do plano e termina quando ela sai do caminho crítico.
#
# Custo zero de token enquanto espera: roda em segundo plano e só devolve
# controle ao encerrar. Não imprime nada a cada volta — só o veredito final.
#
# Encerra quando as três issues SOLO estiverem RESOLVIDAS, isto é: cada uma
# FECHADA (feita) ou marcada `status:blocked` (pulada pela regra do protocolo).
# Os dois casos liberam o Claude — num ele tem contrato, no outro a fila
# travou e não faz sentido continuar esperando.
set -uo pipefail
export PATH="$PATH:/c/Program Files/GitHub CLI"
unset GITHUB_TOKEN GH_TOKEN

REPO="luucasrod/argos"
FASE0="41 43 42"          # SOLO-001, SOLO-003, SOLO-002
INTERVALO=1800            # 30 min
MAX_VOLTAS=20             # ~10 h, para não vigiar para sempre

for volta in $(seq 1 $MAX_VOLTAS); do
  pendentes=""
  for n in $FASE0; do
    info=$(gh issue view "$n" --repo "$REPO" --json state,labels \
            --jq '"\(.state) \(.labels|map(.name)|join(","))"' 2>/dev/null) || info=""
    # sem resposta da API: trata como pendente e tenta na próxima volta
    if [ -z "$info" ]; then pendentes="$pendentes $n(?)"; continue; fi
    estado=$(printf '%s' "$info" | cut -d' ' -f1)
    labels=$(printf '%s' "$info" | cut -d' ' -f2-)
    if [ "$estado" = "CLOSED" ]; then continue; fi
    case "$labels" in *status:blocked*) continue;; esac
    pendentes="$pendentes $n"
  done

  if [ -z "$pendentes" ]; then
    echo "FASE 0 RESOLVIDA na volta $volta"
    for n in $FASE0; do
      gh issue view "$n" --repo "$REPO" --json number,state,title,labels \
        --jq '"  #\(.number) \(.state) [\(.labels|map(.name)|map(select(startswith("status")))|join(""))] \(.title)"'
    done
    echo "--- PRs abertos ---"
    gh pr list --repo "$REPO" --json number,title,isDraft \
      --jq '.[] | "  #\(.number) draft=\(.isDraft) \(.title)"'
    echo "--- relatorio de bloqueios: comentarios novos na #126 ---"
    gh issue view 126 --repo "$REPO" --json comments \
      --jq '.comments | length | "  \(.) comentarios"'
    exit 0
  fi

  sleep $INTERVALO
done

echo "LIMITE DE TEMPO: a Fase 0 nao resolveu em ~10 h. Ainda pendentes:$pendentes"
gh pr list --repo "$REPO" --json number,title --jq '.[] | "  PR #\(.number) \(.title)"'
exit 1
