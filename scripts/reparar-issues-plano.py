"""
Repara título e corpo das issues do plano.

Motivo: `gh issue create --title/--body` no Windows entrega os argumentos em
UTF-8, mas eles chegam interpretados como cp1252 — todo acento virou mojibake
("latência" -> "latÃªncia"). Passar por linha de comando é o problema; a API com
`--input <arquivo JSON>` não tem essa etapa.

Casa cada issue do GitHub com o plano pelo prefixo `[ID]` do título, que é ASCII
e sobreviveu intacto. Idempotente: só escreve quando o conteúdo difere.
"""
import io
import json
import re
import subprocess
import sys
import tempfile
import os

REPO = 'luucasrod/argos'
GH = r'C:\Program Files\GitHub CLI\gh.exe'
env = dict(os.environ)
env.pop('GITHUB_TOKEN', None)
env.pop('GH_TOKEN', None)


def gh(args, inp=None):
    r = subprocess.run([GH] + args, capture_output=True, text=True,
                       encoding='utf-8', env=env)
    if r.returncode != 0:
        return None, (r.stderr or '').strip()
    return r.stdout, None


def main():
    plano = {x['id']: x for x in json.load(io.open(sys.argv[1], encoding='utf-8'))}

    out, err = gh(['issue', 'list', '--repo', REPO, '--state', 'all',
                   '--limit', '400', '--json', 'number,title,body'])
    if err:
        print('erro ao listar:', err)
        return 1
    issues = json.loads(out)

    vistos = {}
    duplicadas = []
    for it in issues:
        m = re.match(r'^\[((?:SOLO|A|B)-\d{3})\]', it['title'])
        if not m:
            continue
        pid = m.group(1)
        if pid in vistos:
            # mantem a de numero menor; a outra e duplicata
            manter, largar = sorted([vistos[pid], it['number']])
            vistos[pid] = manter
            duplicadas.append(largar)
        else:
            vistos[pid] = it['number']

    print(f'issues do plano no GitHub: {len(vistos)} | duplicadas: {duplicadas}')
    faltando = [k for k in plano if k not in vistos]
    if faltando:
        print('SEM issue no GitHub:', faltando)

    corrigidas = 0
    for pid, num in sorted(vistos.items(), key=lambda kv: kv[1]):
        x = plano.get(pid)
        if not x:
            continue
        atual = next((i for i in issues if i['number'] == num), None)
        titulo = f"[{x['id']}] {x['titulo']}"
        if atual and atual['title'] == titulo and 'Ã' not in (atual.get('body') or ''):
            continue
        payload = {'title': titulo, 'body': _corpo(x)}
        fd, caminho = tempfile.mkstemp(suffix='.json')
        with io.open(fd, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False)
        _, err = gh(['api', '-X', 'PATCH', f'repos/{REPO}/issues/{num}',
                     '--input', caminho])
        os.unlink(caminho)
        if err:
            print(f'  #{num} {pid}: ERRO {err[:90]}')
        else:
            corrigidas += 1
            if corrigidas % 10 == 0:
                print(f'  ... {corrigidas} corrigidas')

    print(f'corrigidas: {corrigidas}')

    for num in duplicadas:
        gh(['issue', 'close', str(num), '--repo', REPO, '--reason', 'not planned',
            '--comment', 'Duplicata criada por falha de encoding na primeira '
                         'tentativa. A issue correta e a de numero menor com o '
                         'mesmo ID do plano.'])
        print(f'  #{num} fechada (duplicata)')
    return 0


def _corpo(x):
    dono = x['dono']
    if dono == 'A':
        papel = ('Agente A — Argos F (app, áudio, wake word, UX, diagnóstico '
                 'mobile) → sessão **CLAUDE**')
    elif dono == 'B':
        papel = ('Agente B — Argos Home / Cloud / device layer / integrações / '
                 'memória → sessão **CODEX**')
    else:
        papel = ('**RODAR SOLO** — define contrato compartilhado. Enquanto '
                 'estiver em andamento, o outro agente não inicia tarefa nas '
                 'mesmas áreas.')
    deps = x['deps']
    if deps.strip().lower().startswith('nenhuma'):
        dep_txt = '**Nenhuma** — elegível desde já.'
    else:
        dep_txt = (f'`{deps}` — procure a issue correspondente pelo ID no título '
                   f'(ex.: `gh issue list --search "[SOLO-001]"`). Se a dependência '
                   f'ainda não estiver fechada, **pule esta e vá para a próxima** '
                   f'(ver WORK_PROTOCOL).')
    return f"""> Origem: **Plano de implementação por issues v1**, {x['fase']} — item `{x['id']}`.

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


if __name__ == '__main__':
    sys.exit(main())
