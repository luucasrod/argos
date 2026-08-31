#!/usr/bin/env bash
# Cria no GitHub as 83 issues do "Plano de implementação por issues" v1 (31/08/2026).
#
# Mapeamento de dono:
#   Agente A  (Argos F: app, áudio, wake word, UX, mobile)      -> agente:claude
#   Agente B  (Home, Cloud, device layer, integrações, memória) -> agente:codex
#   RODAR SOLO (contratos, schemas, segurança, gates)           -> rodar-solo + agente:codex
#
# Idempotente por título: pula o que já existe.
set -uo pipefail
REPO="luucasrod/argos"
JSON="$1"
# caminho entendido pelo Git Bash E pelo Python do Windows (/tmp so existe no Bash)
OUT="${TMPDIR:-$PWD}/plano_cmds.jsonl"
OUT_WIN=$(cygpath -m "$OUT" 2>/dev/null || echo "$OUT")

python - "$JSON" "$OUT_WIN" << 'PY'
import io, json, sys
# grava direto em arquivo UTF-8: o console do Windows e cp1252 e quebra em
# qualquer seta ou acento, truncando a geracao no meio.
out = io.open(sys.argv[2], 'w', encoding='utf-8')
iss = json.load(io.open(sys.argv[1], encoding='utf-8'))
for x in iss:
    dono = x['dono']
    if dono == 'A':
        labels = ['agente:claude']; papel = 'Agente A — Argos F (app, áudio, wake word, UX, diagnóstico mobile) → sessão **CLAUDE**'
    elif dono == 'B':
        labels = ['agente:codex']; papel = 'Agente B — Argos Home / Cloud / device layer / integrações / memória → sessão **CODEX**'
    else:
        labels = ['rodar-solo', 'agente:codex']; papel = '**RODAR SOLO** — define contrato compartilhado. Enquanto estiver em andamento, o outro agente não inicia tarefa nas mesmas áreas.'
    labels += [x['prio'].lower(), 'fase:' + x['fase'].split()[1].rstrip('-').strip(), 'plano-v1', 'status:ready']
    deps = x['deps']
    dep_txt = ('**Nenhuma** — elegível desde já.' if deps.strip().lower().startswith('nenhuma')
               else f"`{deps}` — procure a issue correspondente pelo ID no título (ex.: `gh issue list --search \"[SOLO-001]\"`). "
                    "Se a dependência ainda não estiver fechada, **pule esta e vá para a próxima** (ver WORK_PROTOCOL).")
    body = f"""> Origem: **Plano de implementação por issues v1**, {x['fase']} — item `{x['id']}`.

**Dono:** {papel}
**Prioridade:** {x['prio']}
**Dependências:** {dep_txt}

---

{x['corpo']}

---

### Antes de começar
Leia `AGENTS.md`, `docs/ai/CONTEXT.md` e `docs/ai/WORK_PROTOCOL.md`.
Respeite a **zona de propriedade** do seu agente — se precisar editar fora dela,
não edite: pule e registre no relatório de bloqueios.

### Se travar
**Não pare a fila.** Comente aqui o que faltou, marque `status:blocked`, remova o
assignee, registre uma linha no relatório de bloqueios e vá para a próxima issue
elegível."""
    out.write(json.dumps({'title': f"[{x['id']}] {x['titulo']}", 'labels': labels, 'body': body}, ensure_ascii=False))
    out.write(chr(10))
out.close()
PY

echo "== issues a criar: $(wc -l < "$OUT") =="
existentes=$(gh issue list --repo "$REPO" --state all --limit 400 --json title --jq '.[].title')

n=0; criadas=0; puladas=0
while IFS= read -r linha; do
  n=$((n+1))
  titulo=$(printf '%s' "$linha" | python -c "import sys,io,json;sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');print(json.loads(sys.stdin.read())['title'])")
  if printf '%s\n' "$existentes" | grep -Fqx "$titulo"; then
    puladas=$((puladas+1)); continue
  fi
  printf '%s' "$linha" | python -c "
import sys, json, subprocess
d = json.loads(sys.stdin.read())
args = ['gh','issue','create','--repo','$REPO','--title',d['title'],'--body',d['body']]
for l in d['labels']:
    args += ['--label', l]
r = subprocess.run(args, capture_output=True, text=True, encoding='utf-8')
print((r.stdout or r.stderr).strip().splitlines()[-1] if (r.stdout or r.stderr).strip() else 'sem saida')
"
  criadas=$((criadas+1))
  # pausa curta: o GitHub aplica limite secundario em criacao em rajada
  sleep 1.2
done < "$OUT"

echo
echo "== criadas: $criadas | ja existiam: $puladas | total: $n =="
