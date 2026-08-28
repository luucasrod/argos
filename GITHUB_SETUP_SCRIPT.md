# ⚙️ SCRIPT DE SETUP GITHUB — ARGOS

**Status**: Pronto para executar após criar o repositório no GitHub

---

## 🔴 PASSO 0: CRIAR REPOSITÓRIO NO GITHUB (Manual — você faz uma vez)

Você precisa criar o repositório `argos` no seu GitHub. **Escolha um dos dois caminhos**:

### Opção A: Via GitHub Web UI (Recomendado)
1. Vá para https://github.com/new
2. **Repository name**: `argos`
3. **Description**: "Voice assistant for smart home control"
4. **Public** ✓
5. **Initialize with**: Nada (leave empty)
6. **Create repository**

Pronto! Depois volte e rode o script abaixo.

### Opção B: Via GitHub CLI
```bash
gh auth login  # Se não estiver autenticado
gh repo create argos --public --description="Voice assistant for smart home control"
```

---

## ✅ PASSO 1: PUSH DO CÓDIGO (Automático — rode no terminal)

```bash
cd A:\Argos\argos
git push -u origin master
```

Se não funcionar na primeira vez, tente:
```bash
git remote set-url origin https://github.com/luucasrod/argos.git
git push -u origin master
```

**Resultado esperado**: 5 commits aparecem no GitHub (os 4 de setup + 1 anterior)

---

## ✅ PASSO 2: CRIAR GITHUB PROJECTS (Automático com verificações)

Execute este script PowerShell após confirmar que o repo foi criado e os commits subiram:

```powershell
# Script: Setup GitHub Projects via API

$OWNER = "luucasrod"
$REPO = "argos"
$TOKEN = $env:GITHUB_TOKEN  # Você precisa ter isso configurado

if (-not $TOKEN) {
    Write-Host "❌ GITHUB_TOKEN não configurado. Configure assim:"
    Write-Host "   [Environment]::SetEnvironmentVariable('GITHUB_TOKEN', 'seu_token', 'User')"
    Write-Host ""
    Write-Host "   1. Vá para: https://github.com/settings/tokens/new"
    Write-Host "   2. Scopes: repo, project"
    Write-Host "   3. Copie o token"
    Write-Host "   4. Execute: [Environment]::SetEnvironmentVariable('GITHUB_TOKEN', 'seu_token', 'User')"
    exit 1
}

Write-Host "✅ TOKEN configurado"

# Verificar se repo existe
$repoResponse = Invoke-RestMethod `
    -Uri "https://api.github.com/repos/$OWNER/$REPO" `
    -Headers @{"Authorization" = "Bearer $TOKEN"; "X-GitHub-Api-Version" = "2022-11-28"} `
    -ErrorAction SilentlyContinue

if ($repoResponse) {
    Write-Host "✅ Repositório encontrado: $($repoResponse.full_name)"
} else {
    Write-Host "❌ Repositório não encontrado. Crie primeiro em https://github.com/new"
    exit 1
}

# Criar Project
Write-Host "📋 Criando GitHub Project..."

$projectBody = @{
    name = "Argos Development"
    body = "Development workflow for Argos voice assistant"
} | ConvertTo-Json

$projectResponse = Invoke-RestMethod `
    -Uri "https://api.github.com/repos/$OWNER/$REPO/projects" `
    -Method POST `
    -Headers @{
        "Authorization" = "Bearer $TOKEN"
        "X-GitHub-Api-Version" = "2022-11-28"
        "Accept" = "application/vnd.github.indy-preview+json"
    } `
    -ContentType "application/json" `
    -Body $projectBody `
    -ErrorAction Stop

$PROJECT_ID = $projectResponse.id
Write-Host "✅ Project criado: ID $PROJECT_ID"

# Criar colunas
$columns = @("BACKLOG", "READY", "IN PROGRESS", "IN REVIEW", "BLOCKED", "DONE")
$columnIds = @{}

foreach ($col in $columns) {
    $colBody = @{ name = $col } | ConvertTo-Json
    $colResponse = Invoke-RestMethod `
        -Uri "https://api.github.com/projects/$PROJECT_ID/columns" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $TOKEN"
            "Accept" = "application/vnd.github.indy-preview+json"
        } `
        -ContentType "application/json" `
        -Body $colBody `
        -ErrorAction Stop
    $columnIds[$col] = $colResponse.id
    Write-Host "✅ Column criada: $col"
}

Write-Host ""
Write-Host "🎉 GitHub Project configurado!"
Write-Host "   Acesse: https://github.com/$OWNER/$REPO/projects"
Write-Host ""
```

---

## ✅ PASSO 3: CRIAR ISSUES DE TESTE

Execute este script PowerShell para criar Issues automaticamente:

```powershell
# Script: Criar Issues de teste

$OWNER = "luucasrod"
$REPO = "argos"
$TOKEN = $env:GITHUB_TOKEN

$issues = @(
    @{
        title = "fix(stores): replace localStorage with AsyncStorage on native"
        body = @"
Fixes black screen on Android/iOS when toggling devices.

## Problem
useDeviceStore uses localStorage which is unavailable on native (Android/iOS).
This causes a synchronous TypeError on every mutation, which RN reports as fatal.

## Solution
Replace with AsyncStorage (already in dependencies).

## Acceptance Criteria
- [x] Toggling device on native doesn't throw
- [x] No black screen on Android/iOS
- [x] Web still uses localStorage (no migration needed)
- [x] Tests pass (lint, typecheck, build)

Labels: bug, native, critical
"@
        labels = @("bug", "native", "critical")
    },
    @{
        title = "feat(services): add timeout to Tuya API fetches"
        body = @"
Prevents 'Executando...' forever when network is slow.

## Problem
Tuya fetches have no timeout. If network stalls, app hangs indefinitely.

## Solution
Add fetchWithTimeout helper (~10s timeout) and apply to all tuyaService calls.

## Acceptance Criteria
- [x] Tuya calls timeout after 10s
- [x] Error shows in execution overlay
- [x] Voice execution doesn't hang on slow network
- [x] Tests pass

Labels: feature, tuya, blocking
"@
        labels = @("feature", "tuya", "blocking")
    },
    @{
        title = "test(protocol): verify Claude builder worktree workflow"
        body = @"
Test end-to-end workflow: Issue → Branch → PR → Review → Merge

## Acceptance Criteria
- [x] Create branch from READY status
- [x] Make a change (simple file commit)
- [x] Push and open PR with template
- [x] Reviewer approves
- [x] Merge succeeds
- [x] Commit appears in master

Labels: test, protocol
"@
        labels = @("test", "protocol")
    }
)

foreach ($issue in $issues) {
    $body = @{
        title = $issue.title
        body = $issue.body
        labels = $issue.labels
    } | ConvertTo-Json -Depth 10

    Write-Host "Creating: $($issue.title)..."
    
    $response = Invoke-RestMethod `
        -Uri "https://api.github.com/repos/$OWNER/$REPO/issues" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $TOKEN"
            "X-GitHub-Api-Version" = "2022-11-28"
        } `
        -ContentType "application/json" `
        -Body $body

    Write-Host "✅ Issue #$($response.number) criada"
}

Write-Host ""
Write-Host "🎉 Issues criadas! Vá para: https://github.com/$OWNER/$REPO/issues"
```

---

## ✅ PASSO 4: CONFIGURAR BRANCH PROTECTION

```powershell
# Script: Proteger branch master

$OWNER = "luucasrod"
$REPO = "argos"
$BRANCH = "master"
$TOKEN = $env:GITHUB_TOKEN

$protectionBody = @{
    required_status_checks = @{
        strict = $true
        contexts = @()
    }
    enforce_admins = $false
    required_pull_request_reviews = @{
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $false
        required_approving_review_count = 1
    }
    allow_force_pushes = $false
    allow_deletions = $false
    required_linear_history = $false
    allow_auto_merge = $false
} | ConvertTo-Json -Depth 10

Write-Host "Protegendo branch master..."

Invoke-RestMethod `
    -Uri "https://api.github.com/repos/$OWNER/$REPO/branches/$BRANCH/protection" `
    -Method PUT `
    -Headers @{
        "Authorization" = "Bearer $TOKEN"
        "X-GitHub-Api-Version" = "2022-11-28"
    } `
    -ContentType "application/json" `
    -Body $protectionBody

Write-Host "✅ Branch master protegida!"
```

---

## 📋 CHECKLIST DE EXECUÇÃO

1. ☐ Criar repositório no GitHub
2. ☐ Executar: `git push -u origin master`
3. ☐ Configurar `GITHUB_TOKEN`:
   ```powershell
   [Environment]::SetEnvironmentVariable('GITHUB_TOKEN', 'seu_token_aqui', 'User')
   ```
4. ☐ Executar script PowerShell (Passo 2) — criar Project
5. ☐ Executar script PowerShell (Passo 3) — criar Issues
6. ☐ Executar script PowerShell (Passo 4) — proteger master
7. ☐ Verificar no GitHub: https://github.com/luucasrod/argos

---

## 🆘 TROUBLESHOOTING

### "Repository not found"
- [ ] Repositório foi criado? Vá para https://github.com/new
- [ ] URL está correta? Deve ser: `https://github.com/luucasrod/argos.git`

### "GITHUB_TOKEN not found"
- [ ] Token gerado em: https://github.com/settings/tokens/new
- [ ] Scopes: `repo`, `project`
- [ ] Configurado: `[Environment]::SetEnvironmentVariable('GITHUB_TOKEN', 'seu_token', 'User')`

### "API 404 error"
- [ ] Aguarde 30 segundos depois de criar o repo
- [ ] GitHub às vezes demora para sincronizar

---

**Próximos passos após completar**:
1. Acesse: https://github.com/luucasrod/argos/projects
2. Mova Issues para `READY`
3. Comece a usar as worktrees!

