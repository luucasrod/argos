# Integração Jarvis no Argos — Quick Start

**Status:** ✅ Pronto pra integrar  
**Data:** 2026-10-01  
**Objetivo:** Argos detecta "Jarvis" e manda direto, sem pensar

---

## O que mudou?

Antes:
```
Usuário: "Jarvis, resolve issues"
Argos: ??? (tenta entender, pode falhar)
```

Agora:
```
Usuário: "Jarvis, resolve issues"
Argos: "Tem Jarvis? Manda pro bridge!"
Jarvis: (faz o trabalho de entender)
```

---

## Como Integrar

### Opção 1: Usar o novo endpoint (Recomendado)

No seu cliente do Argos (app/components/Chat.tsx ou similar), antes de chamar `/api/chat`:

```typescript
// Detecta "jarvis" automaticamente
async function sendMessage(message: string) {
  // Se tem "jarvis", manda pro bridge
  if (message.toLowerCase().includes('jarvis')) {
    const response = await fetch('/api/jarvis-bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    
    const result = await response.json();
    console.log('Jarvis dispatch:', result.dispatch_status);
    // Mostra pro usuário que foi pro Jarvis
    return;
  }

  // Senão, chat normal
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      system: 'You are a helpful assistant',
      messages: [...messages, { role: 'user', content: message }],
    }),
  });
  
  // ... resto do chat normal
}
```

### Opção 2: Usar wrapper novo (`/api/chat-with-jarvis`)

Se não quiser mexer no frontend, pode usar o novo endpoint que já faz isso:

```typescript
// Em vez de POST /api/chat, usa POST /api/chat-with-jarvis
const response = await fetch('/api/chat-with-jarvis', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'claude-3-5-sonnet-20241022',
    system: 'You are helpful',
    messages: [...messages],
  }),
});
```

Ele automaticamente:
- ✅ Detecta "jarvis"
- ✅ Manda pro bridge se tiver
- ✅ Senão, passa pro chat normal

---

## Fluxo Simples

```
Frontend do Argos
    ↓
    (usuário digita: "Jarvis, resolve issues")
    ↓
POST /api/chat-with-jarvis
    ↓
    Detecta "jarvis"? SIM
    ↓
POST /api/jarvis-bridge (Python bridge)
    ↓
    Analisa, identifica projeto, despacha
    ↓
Resposta: {
  "type": "jarvis_dispatch",
  "jarvis_analysis": {
    "is_jarvis_command": true,
    "project": "argos",
    "action": "fix_issue",
    "dispatch_status": "DISPATCHED:argos:fix_issue"
  }
}
    ↓
Frontend: Mostra "Enviado pro Jarvis: argos - fix_issue"
```

---

## Que tal testar?

```bash
# No terminal, teste o bridge direto
curl -X POST http://localhost:3000/api/jarvis-bridge \
  -H "Content-Type: application/json" \
  -d '{"message": "Jarvis, resolve issues do Argos"}'

# Resposta:
# {
#   "is_jarvis_command": true,
#   "project": "argos",
#   "action": "fix_issue",
#   "dispatch_status": "DISPATCHED:argos:fix_issue"
# }
```

---

## Palavras-chave que Jarvis reconhece

### Projetos
- cashy, cache, cachê
- argos, argus, argôs
- masya, masia, másia
- appwd, app wd
- harness, harness ia
- jarvis

### Ações
- resolve, corrige, fix → fix_issue
- melhora, improve, adiciona → improve_feature
- testa, test, valida → test
- refatora, refactor, limpa → refactor

### Exemplo
```
"Jarvis, resolve os issues do Argos"
→ projeto: argos
→ ação: fix_issue

"Ó Jarvis, melhora o curso de IA"
→ projeto: harness (porque tem "IA" + "curso")
→ ação: improve_feature
```

---

## Debug

### Ver logs do Jarvis
```bash
tail -f C:\Users\syann\Desktop\Jarvis-AI-For-Windows-2026\argos_bridge.log
```

### Ver tarefas despachadas
```bash
cat C:\Users\syann\Desktop\Jarvis-AI-For-Windows-2026\argos_tasks.jsonl
```

### Testar bridge manualmente
```bash
python C:\Users\syann\Desktop\Jarvis-AI-For-Windows-2026\jarvis_argos_bridge.py
```

---

## Próximas melhorias (você pode fazer depois)

1. **Melhorar detecção de projeto no Argos** (quando v4.0 terminar)
2. **UI visual de dispatch** (mostrar que foi pro Jarvis)
3. **Histórico de tarefas** (ver o que foi despachado)
4. **Feedback de progresso** (workers trabalhando)

---

## TL;DR

✅ **Bridge pronto**  
✅ **Endpoints criados** (/api/jarvis-bridge, /api/chat-with-jarvis)  
✅ **Testes passando**  

Próxima:
1. Integra no frontend do Argos
2. Testa com você dizendo "Jarvis, [comando]"
3. Aproveita que Jarvis faz a análise pesada

**Simples assim!**
