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
- **`main` + `docs/ai/CONTEXT.md`** = decisão técnica oficial. Mudança de
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
git worktree add ../argos-<agente>-builder -b <agente>/issue-<N>-<slug> origin/master
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
gh pr create --draft --base master --title "..." --body "..."
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

### Quando parar, obrigatoriamente

- Fila vazia (acima).
- `docs/ai/STOP` existe.
- Duas tarefas seguidas falharam nos checks — algo está errado no ambiente,
  não na tarefa.
- Precisa de algo que só o usuário tem: aparelho físico, login, chave, decisão
  de produto ambígua, custo externo.

### O que NUNCA fazer para continuar ocupado

- Inventar feature que não está na fila.
- Abrir refatoração espontânea.
- Criar roadmap novo por conta própria.
- Reabrir tarefa `requires-human` "pra tentar mesmo assim".

Fila aprovada acabou = trabalho acabou. Propor tarefa nova é permitido
(comentar/abrir issue em `status:blocked` para o usuário avaliar);
**executá-la sem aprovação, não.**

---

## 5. Precisa da minha aprovação, sempre

`git reset --hard`, `git clean` destrutivo, force push, apagar branch, merge na
`main`, migração de banco destrutiva, mudança em produção, mexer em
auth/RLS/segredos, custo externo, mudança arquitetural irreversível.

Na dúvida: **parar e perguntar** custa menos que desfazer.
