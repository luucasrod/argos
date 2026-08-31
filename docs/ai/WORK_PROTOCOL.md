# WORK_PROTOCOL — como os agentes trabalham neste repo

Regras compartilhadas por **Claude** e **Codex**. Quem abre uma sessão aqui lê
isto antes de tocar em qualquer arquivo.

---

## 1. Papéis

| Papel | Faz |
|---|---|
| **BUILDER** | implementa uma tarefa por vez, isolado em worktree própria |
| **REVIEWER** | revisa a entrega do **outro** builder |

Regra dura: **quem implementa não aprova o próprio trabalho.** Claude revisa
Codex, Codex revisa Claude.

## 2. Fonte de verdade

- **GitHub Issues** = fila, dono, status, bloqueio. É aqui que se descobre o
  que fazer. **Não** em arquivo `.md`, **não** no histórico da conversa.
- **Git / PR** = o que mudou.
- **`experimento-grande` + `docs/ai/CONTEXT.md`** = decisão técnica oficial.
  ⚠️ A branch base é **`experimento-grande`**, NÃO `master`. A `master` parou
  no app de junho/2026 (4 abas em inglês, sem voz, só eWeLink) e não é o
  produto. Todos os deploys de produção saem da `experimento-grande`. Mudança de
  CONTEXT dentro de uma branch **não vale** antes do merge.

Estado da tarefa vive em **labels**:

```
status:ready        elegível, ninguém pegou
status:in-progress  alguém reivindicou (assignee diz quem)
status:in-review    PR aberto, esperando o revisor cruzado
status:blocked      dependência ou impedimento
requires-human      NÃO é elegível para agente (precisa celular, adb, browser, conta)
```

---

## 3. O CICLO — é isto que você repete

### 3.1 Pegar tarefa (claim)

```bash
gh issue list --label status:ready --no-assignee --json number,title,labels
```

Ignorar qualquer issue com `requires-human` ou `status:blocked`, e qualquer
uma cuja dependência declarada ainda não esteja fechada.

Reivindicar e **confirmar logo em seguida**:

```bash
gh issue edit <N> --add-assignee @me --add-label status:in-progress --remove-label status:ready
gh issue view <N> --json assignees,labels     # releitura obrigatória
```

Se a releitura mostrar outro assignee, **outro agente venceu a disputa**: larga
essa, escolhe outra. Sem discussão, sem "eu peguei primeiro".

Comentar na issue quais **módulos/pastas** você vai mexer. Antes de editar,
olhar as outras `status:in-progress` — se outra tarefa reservou a mesma área,
escolher outra tarefa em vez de editar por cima.

### 3.2 Isolar

```bash
git worktree add ../argos-<agente>-builder -b <agente>/issue-<N>-<slug> origin/experimento-grande
```

Uma branch por tarefa. Nunca dois builders na mesma branch. Nunca duas sessões
na mesma worktree.

### 3.3 Implementar

Escopo da issue e só. Nada de refatoração gigante não pedida, nada de mexer em
produção, nada de segredo em código. Rodar os checks que existem:

```bash
npx tsc --noEmit     # limpo = só os 2 erros pré-existentes (perfil.tsx, xiaomi-pet.ts)
```

### 3.4 Entregar para revisão

```bash
git push -u origin <branch>
gh pr create --draft --base experimento-grande --title "..." --body "..."
gh issue edit <N> --add-label status:in-review --remove-label status:in-progress
```

O PR descreve: **o que mudou / por quê / como testar / o que foi testado /
riscos**. Screenshot quando muda UI.

> A branch é empurrada **antes** da revisão de propósito — empurrar branch de
> feature não é risco (a `main` é protegida), e é o que permite o revisor ler
> o diff com `gh pr diff` sem entrar na worktree do builder. O portão real é o
> **PR em draft**: ele não entra em lugar nenhum até o revisor liberar.

### 3.5 Revisão cruzada

O REVIEWER lê critério de aceite + `gh pr diff`, procura bug, regressão, edge
case, mudança fora de escopo, segredo vazado, doc desatualizada. Classifica por
severidade. **Não aprova só porque compila.**

- Achou bloqueador → comenta, volta pra `status:in-progress`, builder corrige.
- Aprovado → `gh pr review --approve` + tira o draft (`gh pr ready`).

**Merge não é automático.** O PR aprovado fica pronto e o usuário decide. Em
rodada desassistida (madrugada / usuário fora), o agente **nunca** faz merge.

### 🚫 Publicar OTA é PROIBIDO para agente

```
npx eas update        ← NUNCA, em nenhuma circunstância
```

Um OTA entrega o JavaScript **direto no celular do usuário, na próxima abertura
do app**. Não passa por PR, não passa por revisão, não passa por merge — pula o
protocolo inteiro e altera o aparelho que ele usa de verdade. É mais grave que
um merge indevido, porque não há diff para alguém olhar depois.

O mesmo vale para qualquer ação que atinja o mundo real sem revisão:

- `npx eas update` / `eas build` / `eas submit`
- `adb install`, `adb uninstall`, `adb shell pm clear`
- `vercel deploy` / `vercel alias`
- migração de banco, mudança de RLS, alteração de variável de ambiente
- `git push` na branch base (só na branch da própria tarefa)

Se a tarefa **só puder** ser concluída publicando ou instalando algo: **pare**,
abra o PR em draft com o código pronto, e escreva no PR exatamente qual comando
precisa ser rodado e por quê. **Quem roda é o usuário.**

Ler no aparelho é permitido e encorajado: `adb logcat`, `adb shell dumpsys`,
`adb devices`, `pm list packages`. A linha é **ler pode, escrever não.**

### 3.6 Fechar

Worktree removida (`git worktree remove`), issue fechada com link do PR,
`docs/ai/CONTEXT.md` atualizado **se** houve decisão técnica nova.

---

## 4. ENCADEAMENTO — terminou uma, procura a próxima

Esta é a regra central. Ao fechar uma tarefa, o agente **não pergunta o que
fazer agora e não espera instrução**. Ele executa, nesta ordem:

1. Existe o arquivo `docs/ai/STOP` no repo? → **para imediatamente** e avisa.
2. `gh issue list --label status:ready --no-assignee` — tem alguma elegível
   (sem `requires-human`, sem `status:blocked`, dependências fechadas)?
   - **Não tem** → **PARA**. Reporta: o que entregou, quais PRs ficaram
     abertos, por que a fila acabou. Fim do expediente.
   - **Tem** → volta ao passo 3.1 com ela. Sem pedir confirmação.
3. Repete.

### 🔁 Bloqueou? PULA — não para

Esta é a regra mais importante da fila. **Encontrar um impedimento numa tarefa
NÃO é motivo para encerrar o expediente.** É motivo para pular aquela tarefa e
seguir para a próxima que não dependa dela.

Pule a tarefa (sem encerrar a fila) quando:

- falta autorização do usuário (conta, chave, pagamento, decisão de produto);
- ela exige mexer em área que pertence a outro agente ou a uma issue SOLO;
- uma dependência declarada ainda não foi integrada;
- ela precisa de aparelho físico, serviço externo ou credencial que você não tem;
- você tentou e travou por motivo que não está no seu alcance resolver.

**O que fazer ao pular, sempre nesta ordem:**

1. Comente na própria issue explicando **o que faltou**, em uma frase objetiva.
2. Marque a issue como `status:blocked` e **remova o assignee** — ela volta para
   a fila de outra pessoa.
3. Registre a linha no **relatório de bloqueios** (a issue fixada
   `📋 Relatório de bloqueios`), no formato:
   `#<n> — <o que falta> — <quem resolve: usuário / agente X / issue Y>`
4. **Vá para a próxima tarefa elegível.** Não pare, não peça confirmação.

O objetivo é **entregar o máximo possível numa passada**, deixando por escrito o
que sobrou e de quem depende. Uma fila com dez impedimentos deve terminar com
dez linhas de relatório e todo o resto feito — nunca com nove tarefas paradas
atrás da primeira.

### Quando parar de verdade (só nestes casos)

- **Não há mais nenhuma tarefa elegível** — todas feitas, bloqueadas ou puladas.
- `docs/ai/STOP` existe.
- **Duas tarefas seguidas falharam nos checks** — isso indica ambiente quebrado,
  não tarefa difícil. Continuar só produz lixo.

Ao parar, entregue o relatório final: o que foi feito, quais PRs ficaram
abertos, o que foi pulado e por quê, e o que depende do usuário.

### O que NUNCA fazer para continuar ocupado

- Inventar feature que não está na fila.
- Abrir refatoração espontânea.
- Criar roadmap novo por conta própria.
- Reabrir tarefa `requires-human` "pra tentar mesmo assim".

Fila aprovada acabou = trabalho acabou. Propor tarefa nova é permitido
(comentar/abrir issue em `status:blocked` para o usuário avaliar);
**executá-la sem aprovação, não.**

---

## 4.1 Zonas de propriedade (plano de implementação)

O backlog grande divide o sistema em superfícies. **Cada agente só edita a sua**:

| Agente | Superfície | Diretórios |
|---|---|---|
| **CLAUDE** (Agente A do plano) | Argos F: app, áudio, wake word, UX, personalização no cliente, diagnóstico mobile | `app/`, `components/`, `hooks/`, `services/voice/` |
| **CODEX** (Agente B do plano) | Argos Home, Argos Cloud, device layer, integrações, rotinas, memória, telemetria | `api/`, `services/devices/`, `services/ai/`, `stores/` |
| **RODAR SOLO** | contratos compartilhados, schemas, segurança, release gates, testes ponta a ponta | `contracts/`, `.github/`, `docs/ai/WORK_PROTOCOL.md` |

**Issue marcada `rodar-solo` roda sozinha**: enquanto ela estiver
`status:in-progress`, o outro agente não começa tarefa nova que toque nas
mesmas áreas. Ela define contrato — mudar contrato no meio quebra os dois lados.

### Enforcement automático

- Branches de agente começam com `claude/` ou `codex/`.
- Todo PR referencia a issue reivindicada no corpo (`#<número>`).
- `.github/CODEOWNERS` exige revisão do mantenedor; o check **Ownership Zones**
  compara os arquivos alterados com o prefixo da branch e com o label da issue.
- `contracts/`, `.github/` e o próprio `docs/ai/WORK_PROTOCOL.md` só passam nesse
  check quando uma das issues
  referenciadas tem o label `rodar-solo`.
- A separação é lógica dentro do app Expo atual. Criar ou mover código para
  `/argos-f`, `/argos-home` ou `/argos-cloud` exige decisão e issue próprias.

**`docs/` é livre para os dois.** A seção 3.6 manda atualizar a documentação ao
fechar a tarefa, e o `docs/ai/CONTEXT.md` existe para receber decisão nova a cada
entrega. Só o `WORK_PROTOCOL.md` (este arquivo) é protegido, porque mudar a regra
no meio do jogo afeta os dois agentes.

Se uma tarefa exigir editar fora da sua zona: **não edite**. Pule pela regra
acima e registre no relatório qual arquivo você precisaria ter tocado. Quem
decide é o usuário, ou vira uma issue `rodar-solo` nova.

## 5. Precisa da minha aprovação, sempre

`git reset --hard`, `git clean` destrutivo, force push, apagar branch, merge na
`main`, migração de banco destrutiva, mudança em produção, mexer em
auth/RLS/segredos, custo externo, mudança arquitetural irreversível.

Na dúvida: **parar e perguntar** custa menos que desfazer.
