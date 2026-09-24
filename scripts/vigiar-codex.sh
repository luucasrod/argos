#!/usr/bin/env bash
# Espera o Codex PARAR de produzir e então devolve o controle.
#
# Não acorda a cada entrega: acorda quando ele fica quieto. Assim a revisão
# acontece uma vez, em lote, em vez de uma vez por PR.
#
# Critério de "parou": nenhuma atividade nova (PR criado/atualizado, ou issue
# do plano mudando de status) por 3 sondagens seguidas de 6 min = ~18 min sem
# nada. Um agente trabalhando produz commit ou label bem antes disso.
#
# Também encerra cedo se a fila acabar: nenhuma issue agente:codex ficou
# status:ready nem status:in-progress.
set -uo pipefail
export PATH="$PATH:/c/Program Files/GitHub CLI"
unset GITHUB_TOKEN GH_TOKEN

REPO="luucasrod/argos"
INTERVALO=360          # 6 min
QUIETO_MAX=3           # 3 sondagens sem novidade = parou
MAX_VOLTAS=60          # teto de ~6 h

assinatura() {
  # tudo que muda quando o Codex trabalha: PRs dele e status das issues dele
  {
    gh pr list --repo "$REPO" --state all --limit 60 \
       --json number,updatedAt,headRefName \
       --jq '.[] | select(.headRefName|startswith("codex/")) | "\(.number)\(.updatedAt)"' 2>/dev/null
    gh issue list --repo "$REPO" --state all --limit 200 --label "agente:codex" \
       --json number,updatedAt --jq '.[] | "\(.number)\(.updatedAt)"' 2>/dev/null
  } | sort | md5sum | cut -c1-32
}

anterior=""
quieto=0

for volta in $(seq 1 $MAX_VOLTAS); do
  atual=$(assinatura)

  if [ -n "$anterior" ] && [ "$atual" = "$anterior" ]; then
    quieto=$((quieto + 1))
  else
    quieto=0
  fi
  anterior="$atual"

  # fila esgotada?
  restam=$(gh issue list --repo "$REPO" --state open --label "agente:codex" \
            --label "status:ready" --limit 200 --json number --jq 'length' 2>/dev/null || echo "?")
  andando=$(gh issue list --repo "$REPO" --state open --label "agente:codex" \
            --label "status:in-progress" --limit 200 --json number --jq 'length' 2>/dev/null || echo "?")

  if [ "$restam" = "0" ] && [ "$andando" = "0" ]; then
    echo "FILA ESGOTADA na volta $volta — nenhuma issue codex ready nem in-progress"
    break
  fi

  if [ "$quieto" -ge "$QUIETO_MAX" ]; then
    echo "CODEX PAROU — $((QUIETO_MAX * INTERVALO / 60)) min sem atividade (volta $volta)"
    break
  fi

  sleep $INTERVALO
done

echo
echo "=== PRs do Codex abertos ==="
gh pr list --repo "$REPO" --json number,title,isDraft,headRefName,additions,deletions \
  --jq '.[] | select(.headRefName|startswith("codex/")) | "  #\(.number) draft=\(.isDraft) +\(.additions)/-\(.deletions)  \(.title)"'
echo "=== issues codex por status ==="
for s in in-progress in-review blocked ready; do
  n=$(gh issue list --repo "$REPO" --state open --label "agente:codex" --label "status:$s" \
       --limit 200 --json number --jq 'length' 2>/dev/null)
  echo "  $s: $n"
done
echo "=== bloqueios registrados na #126 (ultimos) ==="
gh issue view 126 --repo "$REPO" --json comments \
  --jq '.comments[-6:][] | "  [\(.createdAt[11:16])] \(.body[:110])"' 2>/dev/null
