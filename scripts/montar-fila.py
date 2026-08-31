"""
Monta a fila de um agente intercalando cadeias de dependência.

O PROBLEMA QUE ISTO RESOLVE
Numa fila em ordem numérica, as issues costumam formar uma cadeia linear:
B-005 depende de B-004, B-006 depende de B-004, B-007 depende de B-006...
O agente entrega a primeira, abre PR, e descobre que TODO o resto depende dela
estar integrada. Como a revisão é assíncrona, ele bloqueia a cadeia inteira e
para. Resultado observado em 31/08: uma tarefa entregue por rodada.

A SAÍDA
Agrupar as issues por cadeia (quem depende de quem) e INTERCALAR: primeiro item
da cadeia A, primeiro da cadeia B, primeiro da C, depois segundo da A... Assim,
quando o agente termina uma tarefa e o PR fica esperando revisão, a próxima da
fila é de outra cadeia — independente do que acabou de ser entregue.

Não elimina a espera: quando as cadeias se esgotam, ainda é preciso mergear.
Mas troca "entrega 1 e para" por "entrega N e para", onde N é o número de
cadeias independentes disponíveis.

USO
    python scripts/montar-fila.py <issues_full.json> <agente>
    agente: claude | codex
"""
import io
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

REPO = 'luucasrod/argos'
GH = r'C:\Program Files\GitHub CLI\gh.exe'
_env = dict(os.environ)
_env.pop('GITHUB_TOKEN', None)
_env.pop('GH_TOKEN', None)


def estado_github():
    """Devolve {id_do_plano: (numero, estado, labels)} do que existe no GitHub."""
    r = subprocess.run(
        [GH, 'issue', 'list', '--repo', REPO, '--state', 'all', '--limit', '400',
         '--json', 'number,title,state,labels'],
        capture_output=True, text=True, encoding='utf-8', env=_env)
    out = {}
    for it in json.loads(r.stdout):
        m = re.match(r'^\[((?:SOLO|A|B)-\d{3})\]', it['title'])
        if m:
            out[m.group(1)] = (
                it['number'], it['state'],
                {l['name'] for l in it['labels']},
            )
    return out


def deps_de(pid, plano):
    d = plano[pid]['deps'].strip()
    if d.lower().startswith('nenhuma'):
        return []
    return [p.strip() for p in d.split(',') if p.strip()]


def main():
    plano = {x['id']: x for x in json.load(io.open(sys.argv[1], encoding='utf-8'))}
    agente = sys.argv[2].lower()
    label = f'agente:{agente}'
    gh_state = estado_github()

    def satisfeita(dep):
        """Dependência conta como resolvida se está fechada — ou fora do plano."""
        if dep not in gh_state:
            return True
        return gh_state[dep][1] == 'CLOSED'

    # candidatas: do agente, abertas, não bloqueadas por decisão externa
    cand = []
    for pid, x in plano.items():
        if pid not in gh_state:
            continue
        num, estado, labels = gh_state[pid]
        if estado != 'OPEN' or label not in labels:
            continue
        if {'aguarda-argos-home', 'requires-human'} & labels:
            continue
        cand.append(pid)

    # elegíveis agora = todas as dependências já fechadas
    elegiveis = [p for p in cand if all(satisfeita(d) for d in deps_de(p, plano))]

    # cadeia = raiz elegível de onde a issue descende
    filhos = defaultdict(list)
    for p in cand:
        for d in deps_de(p, plano):
            if d in cand:
                filhos[d].append(p)

    def cadeia_desde(raiz):
        """Ordem topológica dentro de uma cadeia, começando na raiz."""
        ordem, fila = [], [raiz]
        while fila:
            atual = fila.pop(0)
            if atual in ordem:
                continue
            ordem.append(atual)
            fila.extend(sorted(filhos.get(atual, [])))
        return ordem

    cadeias = [cadeia_desde(r) for r in sorted(elegiveis)]
    # remove duplicatas: issue só aparece na primeira cadeia que a alcança
    vistas, limpas = set(), []
    for c in cadeias:
        nova = [p for p in c if p not in vistas]
        vistas.update(nova)
        if nova:
            limpas.append(nova)

    # INTERCALAR: um de cada cadeia por rodada
    fila, i = [], 0
    while any(len(c) > i for c in limpas):
        for c in limpas:
            if len(c) > i:
                fila.append(c[i])
        i += 1

    print(f'cadeias independentes: {len(limpas)}')
    for n, c in enumerate(limpas, 1):
        print(f'  cadeia {n}: ' + ' -> '.join(c))
    print()
    print(f'ANTES de mergear qualquer coisa, o agente consegue entregar '
          f'{len(limpas)} tarefa(s) seguidas (uma por cadeia).')
    print()
    print('FILA INTERCALADA:')
    linha = []
    for p in fila:
        num = gh_state[p][0]
        linha.append(f'#{num} ({p})')
    print('  ' + ' -> '.join(linha))
    print()
    print('so os numeros:')
    print('  ' + ' '.join(f'#{gh_state[p][0]}' for p in fila))


if __name__ == '__main__':
    main()
