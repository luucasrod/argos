# ✅ SETUP COMPLETO — CLAUDE CODE + CODEX PROTOCOL

**Data**: 2026-08-28  
**Status**: PRONTO PARA USO  
**Próximas ações**: apenas itens manuais listados abaixo

---

## O Que Foi Implementado ✅

### 1. **Documentação Estruturada** (`docs/ai/`)
- ✅ `CONTEXT.md` — Overview, arquitetura, decisões, restrições
- ✅ `PROJECT_MAP.md` — Mapa visual, status de módulos, blocadores
- ✅ `WORK_PROTOCOL.md` — Protocolo de 4 papéis (builders/reviewers), branch policy, sources of truth
- ✅ `DAILY_GUIDE.md` — Quick reference (2 min) para builders e reviewers

### 2. **Configuração de Sessões**
- ✅ `CLAUDE.md` — Configuração para CLAUDE BUILDER e CLAUDE REVIEWER
- ✅ `AGENTS.md` — Configuração para CODEX BUILDER e CODEX REVIEWER

### 3. **Git Worktrees Isoladas**
- ✅ `A:/Argos/argos-claude-builder` (branch: `claude-builder-main`)
  - Isolada, pronta para Claude implementar
- ✅ `A:/Argos/argos/argos-codex-builder` (branch: `codex-builder-main`)
  - Isolada, pronta para Codex implementar
- ✅ `A:/Argos/argos` (main checkout, branch: `master`)
  - Protegida (não toca diretamente)

### 4. **Proteção Básica**
- ✅ `.gitignore` verifica credenciais (não versionadas)
- ✅ Commits assinados com formato consistente
- ✅ Branch naming convention definida (`claude/issue-X-*`, `codex/issue-Y-*`)

### 5. **Teste de Fluxo**
- ✅ Worktrees isoladas funcionando
- ✅ Commits em paralelo sem conflito (teste realizado)
- ✅ Master não foi afetado por mudanças em builders

---

## O Que Você Precisa Fazer Manualmente ⚠️

### **1. CRÍTICO: Configurar Remote Correto**

O remote ainda está com placeholder:
```
origin	https://github.com/SEU_USUARIO/argos.git (fetch)
origin	https://github.com/SEU_USUARIO/argos.git (push)
```

**Ação**:
```bash
cd A:\Argos\argos
git remote set-url origin https://github.com/seu_usuario_real/seu_repo_real.git
git remote -v  # Verificar
```

Depois, tente:
```bash
git push origin master  # Deve subir os dois commits de setup
```

---

### **2. IMPORTANTE: Configurar GitHub Projects**

A "fila operacional" (Kanban) ainda não está criada. Você precisa:

1. **No repositório GitHub**:
   - Vá para aba "Projects"
   - Clique "New project" → "Table" (ou "Board")
   - Nome: "Argos Development"
   - Columns: `BACKLOG`, `READY`, `IN PROGRESS`, `IN REVIEW`, `BLOCKED`, `DONE`

2. **Configurar campos personalizados**:
   - Prioridade (dropdown: P0, P1, P2)
   - Módulo (text: Voice, Tuya, UI, etc)
   - Responsável (assignee)
   - Branch (text)
   - PR # (text)

3. **Atualizar links em**:
   - `CLAUDE.md` — seção "Links"
   - `AGENTS.md` — seção "Links"
   - `DAILY_GUIDE.md` — "URLs Importantes"

---

### **3. IMPORTANTE: Criar Primeira Batch de Issues**

Para testar o fluxo end-to-end, crie 2-3 Issues de teste:

**Exemplo Issue 1: Fix AsyncStorage em useDeviceStore** (do audit)
```
Title: fix(stores): replace localStorage with AsyncStorage on native
Body:
  Fixes black screen on Android/iOS when toggling devices.
  
  useDeviceStore uses localStorage which is unavailable on native.
  Replace with AsyncStorage (already in dependencies).
  
  Acceptance criteria:
  - Toggling device on native doesn't throw
  - No black screen
  - Web still uses localStorage (no migration needed)
  
Labels: bug, native, critical
Milestone: Urgent fixes
```

**Exemplo Issue 2: Add timeout to Tuya fetches** (do audit)
```
Title: feat(services): add timeout wrapper for Tuya API calls
Body:
  Prevents "Executando..." forever when network is slow.
  
  Add fetchWithTimeout helper that aborts after 10s.
  Apply to all tuyaService calls.
  
Acceptance criteria:
  - Tuya calls timeout after 10s
  - Error shows in overlay
  - Voice execution doesn't hang
  
Labels: feature, tuya, blocking
```

Depois mova para `READY` no Projects.

---

### **4. RECOMENDADO: Restaurar Branch experimento-grande**

Você tem um stash com trabalho anterior:

```bash
cd A:\Argos\argos
git stash list  # Deve mostrar "stash@{0}: WIP: voice and device improvements..."

# Quando quiser continuar:
git checkout experimento-grande
git stash pop  # Restaura as mudanças
```

---

### **5. RECOMENDADO: Proteger Master no GitHub**

Se ainda não configurado:

1. **GitHub**: Settings → Branches → "Add rule"
2. **Apply to**: `master` (ou seu branch principal)
3. **Require pull request reviews before merging**: ON (require 1 approval)
4. **Require status checks to pass before merging**: ON (se CI configurado)
5. **Dismiss stale pull request approvals**: ON
6. **Require branches to be up to date before merging**: ON

Isso força o protocolo: ninguém faz push direto.

---

## Próximos Passos (Depois de Setup Manual)

### Teste End-to-End Recomendado

1. **Você (planejador)**: Cria 1 Issue simples (ex: "Add comment to CONTEXT.md")
2. **Claude Builder**: 
   - Entra em `argos-claude-builder`
   - Cria branch `claude/issue-001-context-comment`
   - Faz mudança, commit, push, abre PR
3. **Codex Reviewer**: 
   - Revisa PR no GitHub
   - Aprova
4. **Claude Builder**: Mergia PR
5. **Verificar**: Commit apareceu em master

Se fluir sem atrito, sistema está pronto.

---

## Documentos Criados (Para Referência)

| Arquivo | Propósito |
|---------|----------|
| `docs/ai/CONTEXT.md` | Verdade técnica (produto, arquitetura, decisões) |
| `docs/ai/PROJECT_MAP.md` | Visão macro (módulos, status, blocadores) |
| `docs/ai/WORK_PROTOCOL.md` | Protocolo (papéis, claim, branches, merge policy) |
| `docs/ai/DAILY_GUIDE.md` | Quick ref (2 min) para builders e reviewers |
| `CLAUDE.md` | Config Claude sessions |
| `AGENTS.md` | Config Codex sessions |
| `SETUP_COMPLETE.md` | Este arquivo |

---

## Worktrees — Localização e Uso

```
A:\Argos\
├── argos/                        (main checkout, NEVER touch directly)
│   ├── argos-codex-builder/      (Codex builder worktree)
│   ├── docs/ai/                  (documentation)
│   ├── CLAUDE.md
│   ├── AGENTS.md
│   └── SETUP_COMPLETE.md
└── argos-claude-builder/         (Claude builder worktree)
```

**Usar assim**:
- Claude Builder: `cd A:\Argos\argos-claude-builder`
- Codex Builder: `cd A:\Argos\argos\argos-codex-builder`
- Main (admin/review): `cd A:\Argos\argos`

---

## Troubleshooting Rápido

### "Error: not a git repository"
Você está fora da worktree. Verifique `pwd` e `cd` para a correta.

### "fatal: 'origin' does not appear to be a 'git' repository"
Remote ainda é placeholder. Siga seção **1. CRÍTICO** acima.

### "Conflicts in rebase"
Rare (cada builder em Issue diferente). Resolva manualmente ou chame para ajuda.

### "I don't know what Issue to work on"
Procure no GitHub Projects por cards em status `READY`. Assign to yourself, move to `IN PROGRESS`.

---

## Checklist Final

- [ ] Remote configurado com URL real
- [ ] GitHub Projects criado (BACKLOG, READY, IN PROGRESS, IN REVIEW, BLOCKED, DONE)
- [ ] Master protegido (branch protection rules)
- [ ] 2-3 Issues de teste criadas e em READY
- [ ] Documentos revistos (`CONTEXT.md`, `PROTOCOL`, `DAILY_GUIDE.md`)
- [ ] Teste end-to-end completado (Issue → Branch → PR → Merge → DONE)

---

## Resumo Executivo

✅ **Sistema pronto**: Builders podem começar a pegar Issues, implementar isolados, fazer PR para review cruzada.

⏳ **Você precisa fazer**: 
1. Git remote real
2. GitHub Projects Kanban
3. Criar Issues teste
4. Test run end-to-end

📖 **Documentação completa**: Tudo documentado (ver seção "Documentos Criados").

🚀 **Próxima etapa**: Claude Builder pega Issue #1, Codex Builder pega Issue #2, ambos trabalham paralelo.

---

**Criado em**: 2026-08-28  
**Versão**: 1.0  
**Autor**: Setup Automático (Claude Code Protocol Configuration)  
**Status**: COMPLETO - Aguardando finalização manual

Para dúvidas: Ler `docs/ai/WORK_PROTOCOL.md` ou `docs/ai/DAILY_GUIDE.md`
