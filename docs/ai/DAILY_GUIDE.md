# GUIA DE USO DIÁRIO — ARGOS + CLAUDE CODE + CODEX

**Tempo de leitura**: 2 minutos

---

## Seu papel hoje é BUILDER ou REVIEWER?

### 🔨 SE FOR BUILDER (implementando uma Issue)

**Passo 1: Abrir worktree**
```bash
# CLAUDE BUILDER:
cd /path/to/argos-claude-builder

# CODEX BUILDER:
cd /path/to/argos/argos-codex-builder
```

**Passo 2: Verificar e sincronizar**
```bash
git fetch origin
git rebase origin/master
git status  # deve estar limpo
```

**Passo 3: Criar branch da Issue**
```bash
# Procure no GitHub Projects qual Issue você vai trabalhar
# Confirme que está assignada a você e em status IN PROGRESS

git checkout -b claude/issue-{id}-{description}
# ou
git checkout -b codex/issue-{id}-{description}
```

**Passo 4: Implementar**
- Edite os arquivos
- Rode testes: `npm run lint && npm run typecheck && npm run build`
- Comitar quando pronto: `git commit -m "type(scope): message — fixes #id"`

**Passo 5: Push e PR**
```bash
git push origin claude/issue-123-description

# Abra PR no GitHub com:
# - Descrição clara
# - Que foi testado
# - Link: "Fixes #123"

# Mude Issue status para: IN REVIEW
```

**Passo 6: Aguarde review cruzada**
- Outro builder (Codex ou Claude Reviewer) vai revisar
- Se feedback: fix localmente, commit novo, push
- Quando aprovado: merge no GitHub

**Passo 7: Confirme merge**
```bash
git log origin/master | head -1  # veja seu commit
```

---

### 👀 SE FOR REVIEWER (revisando PR de outro builder)

**Passo 1: Abrir GitHub**
- Vá para a PR aberta
- Leia a Issue primeiro (contexto)
- Leia a PR description (o que mudou e por quê)

**Passo 2: Checar diff**
- Clique em "Files changed"
- Verifica mudanças fazem sentido para a Issue
- Procura bugs óbvios, edge cases

**Passo 3: Verificar checklist**
- ✅ Testes passaram (CI)? (veja aba "Checks")
- ✅ Código sem segredos expostos?
- ✅ Sem força bruta, sem SQL injection
- ✅ CONTEXT.md atualizado (se arquitetura mudou)?

**Passo 4: Decidir**
```
Se tem blocker (bug real, scope violation):
  Comenta: "Blocker: [razão específica]"
  NÃO aprova

Se tudo ok:
  Clica "Approve" (ou comenta "Approved")
  Permite merge
```

**Passo 5: Se precisar corrigir**
```bash
# NÃO edita a worktree do outro builder!
git checkout -b claude-review-fix-issue-123
# ou
git checkout -b codex-review-fix-issue-123

# Faz a correção
git commit && git push

# Comenta no PR: "Suggested fix: PR #XYZ"
```

---

## URLs Importantes

- **Repositório**: https://github.com/SEU_USUARIO/argos
- **GitHub Projects**: [configurado após setup]
- **Issues**: [link to GitHub Issues]
- **Protocol**: Ler `docs/ai/WORK_PROTOCOL.md` quando dúvida

---

## Checklist Rápido Antes de Trabalhar

- [ ] Que Issue vou trabalhar? (github.com/projects/...)
- [ ] Estou assignado? (status IN PROGRESS?)
- [ ] Estou na worktree certa?
  - Claude Builder → `argos-claude-builder`
  - Codex Builder → `argos-codex-builder`
- [ ] Master está sincronizado? (`git rebase origin/master`)
- [ ] Minha branch segue convença? (`claude/issue-123-...` ou `codex/issue-...`)

---

## Se Ficou Preso

1. **Bloqueado por outra Issue?** → Comenta "Blocked by issue #XYZ" na Issue + muda status para BLOCKED
2. **Erro de Git?** → Ler `docs/ai/WORK_PROTOCOL.md` seção "Worktrees — Como Funcionar"
3. **Dúvida de arquitetura?** → Ler `docs/ai/CONTEXT.md`
4. **Dúvida de módulo?** → Ler `docs/ai/PROJECT_MAP.md`

---

## Comandos Essenciais

```bash
# Sync with master
git fetch origin && git rebase origin/master

# Create branch
git checkout -b claude/issue-123-feature

# Commit
git add . && git commit -m "type(scope): message — fixes #123"

# Push
git push origin claude/issue-123-feature

# See what changed
git diff master..HEAD

# Reset to last commit (undo changes)
git reset --hard HEAD

# See your branches
git branch -a
```

---

**Última atualização**: 2026-08-28
**Tempo para dominar**: ler este arquivo + `WORK_PROTOCOL.md`
