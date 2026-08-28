# PROTOCOLO DE TRABALHO — CLAUDE CODE + CODEX

## Princípios

1. **Uma fonte de verdade por domínio**:
   - GitHub Projects/Issues = estado operacional (quem faz, status, bloqueios)
   - Git/PRs = histórico de alterações (diffs, commits, reviews)
   - CONTEXT.md em master = verdade técnica consolidada
   - PROJECT_MAP.md = mapa visual (atualizado após merges estruturais)

2. **Segurança > Autonomia**: Parar antes de data loss, force push, credenciais expostos, produção.

3. **Isolamento via Git Worktrees**: Cada builder tem sua worktree isolada. Reviewers não editam builder's worktree.

4. **Claim Seguro**: Usar GitHub Issues assignment/status para evitar competição de builders.

5. **Sem Auto-Features**: Agentes só trabalham em tarefas aprovadas. Quando a fila termina, param.

---

## Papéis Definidos

### 1. CLAUDE BUILDER
**Responsabilidade**: Implementar tarefas independentes aprovadas
**Worktree**: `argos-claude-builder` (isolada em outro diretório)
**Fluxo**:
  1. Ler Issue aprovada e critério de aceite
  2. Verificar dependencies e confirmar claim (assignment no GitHub)
  3. Atualizar status para `IN PROGRESS`
  4. Checkout/rebase branch a partir de master
  5. Implementar feature/fix conforme escopo
  6. Executar testes locais (lint, typecheck, build, unit)
  7. Commit + Push
  8. Abrir PR com template (o que mudou, por quê, como testar, testes rodados)
  9. Mover Issue para `IN REVIEW`
  10. NÃO autoaprovar

**Restrições**:
  - Respeitar escopo da Issue (sem refatoração gigante não solicitada)
  - Não tocar produção/database sem aprovação
  - Não expor segredos (.env, tokens)
  - Consultar CONTEXT.md e PROJECT_MAP.md quando necessário
  - Se encontrar bloqueio externo, sinalizar como BLOCKED no GitHub

**Limite de Autonomia**:
  - Só trabalha em Issues aprovadas
  - Não inventa features
  - Não faz refatoração espontânea fora de escopo

---

### 2. CODEX BUILDER
**Responsabilidade**: Implementar tarefas independentes aprovadas (em paralelo com Claude)
**Worktree**: `argos-codex-builder` (isolada, diferente de Claude)
**Fluxo**: Idêntico ao Claude Builder, mas worktree diferente

**Coordenação**:
  - Cada builder trabalha em Issue diferente (claim no GitHub evita conflito)
  - Se hit merge conflict em master, rebase seguro com comunicação

---

### 3. CLAUDE REVIEWER
**Responsabilidade**: Revisar prioritariamente PRs do Codex
**Worktree**: NÃO precisa de worktree permanente (revisa diff/checks no GitHub)
**Se precisar corrigir**:
  - Cria branch/worktree própria (ex: `claude-review-fix-issue-123`)
  - NÃO edita silenciosamente a worktree do Codex

**Checklist de Review**:
  ✅ PR descreve claramente o quê/por quê/como testar
  ✅ Diff corresponde ao escopo da Issue
  ✅ Testes rodaram com sucesso
  ✅ Sem bugs óbvios, edge cases cobertos
  ✅ Segurança ok (sem credenciais, SQL injection, XSS, etc)
  ✅ Migração de DB segura (se aplicável)
  ✅ RLS policies verificadas (Supabase)
  ✅ CONTEXT.md e PROJECT_MAP.md atualizados (se estrutura mudou)
  ✅ Checks/linting aprovados

**Severidade**:
  🔴 Blocker = devolver para correção
  🟡 Minor = pode sugerir, mas não bloqueia
  🟢 Approved = permite merge

---

### 4. CODEX REVIEWER
**Responsabilidade**: Revisar prioritariamente PRs do Claude
**Fluxo**: Idêntico ao Claude Reviewer

---

## Fluxo de Uma Tarefa

```
┌─ BACKLOG (planejador quebra objetivo em Epics/Issues)
│  ├─ Issue criada em GitHub Projects
│  ├─ Critério de aceite definido
│  ├─ Dependencies mapeadas
│  └─ Status: BACKLOG
│
├─ READY (dependências prontas)
│  └─ Status: READY (elegível para builder reivindicar)
│
├─ CLAIM (builder reivindicação segura)
│  ├─ Builder verifica Issue
│  ├─ Builder faz "assign to me" / atualiza status
│  ├─ Builder IMEDIATAMENTE relê para confirmar assignment
│  └─ Se outro builder venceu, escolhe outra Issue
│
├─ IN PROGRESS (builder trabalha)
│  ├─ Status: IN PROGRESS
│  ├─ Branch: claude/issue-123-intent ou codex/issue-124-tts
│  ├─ Worktree: isolada
│  ├─ Implementação conforme critério
│  ├─ Testes locais
│  ├─ Commit + Push
│  └─ Abre PR com descrição
│
├─ IN REVIEW (reviewer verifica)
│  ├─ Status: IN REVIEW (PR aberta)
│  ├─ Reviewer (outro builder) lê Issue + PR + diff
│  ├─ Se blocker: comenta e devolve para correção
│  ├─ Se ok: aprova
│  └─ Checks/CI devem passar
│
├─ MERGE (aprovado)
│  ├─ Merge para master (via GitHub UI)
│  ├─ Branch deletada
│  ├─ Status: DONE
│  ├─ Notificação: outras Issues dependentes podem sair de BLOCKED
│  └─ Se alterou estrutura (novo módulo, remoção): atualizar PROJECT_MAP.md
│
└─ DONE (concluído)
   ├─ Issue fechada
   ├─ Trabalho integrado em master
   └─ Builder livre para nova Issue
```

---

## GitHub Projects / Kanban

**Status Columns**:
- `BACKLOG` → elegível mas não pronto (tem dependencies)
- `READY` → pronto para reivindicar
- `IN PROGRESS` → builder trabalhando (atualizar com branch name)
- `IN REVIEW` → PR aberta, aguardando review cruzada
- `BLOCKED` → depende de outra Issue ou recurso externo
- `DONE` → merged em master

**Campos de cada Card**:
- Título
- Prioridade (P0, P1, P2)
- Módulo/Área (Voice, Tuya, UI, etc)
- Responsável (builder assign)
- Branch (quando IN PROGRESS)
- PR # (quando IN REVIEW)
- Labels (bug, feature, refactor, native, etc)

---

## Branch Naming

```
claude/issue-{id}-{short-description}
codex/issue-{id}-{short-description}

Exemplos:
  claude/issue-42-zustand-asyncstorage-fix
  codex/issue-43-tuya-timeout-handler
  claude/issue-44-wake-word-manifest-fix
```

**Regra**: Uma Issue = uma branch = um builder (claim no GitHub)

---

## Commit Message Format

```
type(scope): subject — fixes/relates to #issue-id

body (optional):
  Why this change is needed
  What was the approach
  Any trade-offs or assumptions

footer (optional):
  Co-Authored-By: ...
```

**Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

**Exemplos**:
```
fix(stores): replace localStorage with AsyncStorage on native — fixes #42

LocalStorage is unavailable on Android/iOS, causing zustand persist
to throw synchronously on every mutation. Use AsyncStorage for native,
localStorage for web.

Co-Authored-By: Claude Haiku <noreply@anthropic.com>
```

---

## Proteção da Main

✅ **Regras ativadas em master**:
  - ✓ Sem push direto (PR obrigatória)
  - ✓ PR exige aprovação de reviewer cruzado
  - ✓ Checks (lint, typecheck, build) devem passar
  - ✓ Conflitos devem ser resolvidos antes do merge

🔐 **Aprovações de alto impacto** (exigem aprovação do planejador):
  - Mudança arquitetural ampla
  - Qualquer touch em produção/database destrutivo
  - Alteração de auth/permissions
  - Padrão novo (ex: novo Zustand store, nova API pattern)
  - Mudanças irreversíveis

---

## Worktrees — Como Funcionar

### Criar Worktree para Builder

```bash
# Na raiz do repo
git worktree add ../argos-claude-builder master
# Abre uma nova árvore Git isolada em ../argos-claude-builder
```

### Workflow do Builder

```bash
cd ../argos-claude-builder

# 1. Update master
git fetch origin
git rebase origin/master

# 2. Create branch for Issue
git checkout -b claude/issue-42-fix-name

# 3. Implement
# ... editar, testar ...

# 4. Commit
git add .
git commit -m "fix(...): ..."

# 5. Push
git push origin claude/issue-42-fix-name

# 6. Abrir PR no GitHub (web UI)
```

### Reviewer (Sem Worktree Permanente)

```bash
# Se apenas revisar (GitHub web UI):
# - Ler diff no GitHub
# - Rodar checks
# - Deixar comentários
# - Aprovar

# Se precisar corrigir:
cd ../argos-claude-reviewer-temp
git worktree add . master  # ou origem da PR
git checkout -b claude-review-fix-issue-42
# ... corrigir ...
git commit && push
# Depois remover worktree
git worktree remove .
```

---

## Segredos & Segurança

✅ **Verificar antes de CADA push**:
  - `.env` NUNCA versionado (no .gitignore)
  - Tokens Tuya/Xiaomi/eWeLink/Supabase NUNCA em commits
  - API keys NUNCA em commits
  - Credenciais de build NUNCA em commits

🔐 **Se segredo já está no histórico**:
  - NÃO tente reescrever histórico sozinho (force push)
  - Chamar planejador imediatamente para decidir ação
  - Possivelmente rotacionar credenciais via Supabase/integrações

---

## Autonomia — Limites Duros

**Builders PODEM**:
  ✅ Implementar qualquer Issue aprovada
  ✅ Refatoração de escopo (ex: renomear variável dentro de um módulo)
  ✅ Adicionar testes para código existente
  ✅ Atualizar docs (README, CONTEXT.md)
  ✅ Corrigir bugs em escopo (não abrir novos bugs)

**Builders NÃO PODEM**:
  ❌ Inventar novas features fora de uma Issue aprovada
  ❌ Fazer refatoração gigante não solicitada
  ❌ Mudar produção sem aprovação (database destrutivo, deploy)
  ❌ Deletar branches/history importantes
  ❌ Expor credenciais
  ❌ Continuar indefinidamente quando fila acabar (parar e avisar)

**Quando fila termina**:
  1. Builder verifica se tem Issues em BLOCKED (depende dele)
  2. Se sim: sinaliza em comentário que dependência foi resolvida
  3. Se não: Avisa "fila aprovada terminada, aguardando novas tarefas"
  4. NÃO inventa work novo sozinho

---

## Falhas & Tratamento

### Se Builder não conseguir fazer Issue

```
Comentário na Issue:
  "Bloqueado: [razão específica]
   Dependência: issue #XX
   Parado em: [último passo]"

Mover para BLOCKED, re-assign para None
```

### Se PR recebe comment de reviewer

```
Builder lê comment
  ├─ Se é blocker:
  │   └─ Faz correção, commit novo, push
  │       (não amend, cria novo commit para rastreabilidade)
  └─ Se é minor/sugestão:
      └─ Decidir se aceita ou comenta justificativa
```

### Se Check falha em CI

```
Builder lê erro de CI
  ├─ Fix localmente
  ├─ Commit + push
  └─ Re-trigger CI (se necessário)
```

---

## Template de PR

```markdown
# [Issue #42] Descrição curta da feature/fix

## Summary
Explique em 2-3 bullet points o quê foi mudado e por quê.

## Changes
- Modified `stores/useDeviceStore.ts`: replace localStorage with AsyncStorage
- Modified `app/_layout.tsx`: add error handler for native fatal errors
- Added `services/devices/fetchWithTimeout.ts`: timeout wrapper for Tuya fetches

## How to Test
1. Open Casa tab
2. Toggle a Tuya device
3. Should not go black screen on native
4. Check DevTools console for no uncaught exceptions

## Verification
- [x] Tests run locally (lint, typecheck, build)
- [x] Manual testing on platform (native/web as applicable)
- [x] No secrets exposed
- [x] CONTEXT.md updated (if applicable)
- [x] No unrelated refactoring

## Related
Fixes #42
Related to #41
```

---

**Última atualização**: 2026-08-28 (inicialização)
**Responsável**: Setup automático (Claude Code protocol configuration)
