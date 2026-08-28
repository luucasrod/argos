# Arquitetura Híbrida de Roteamento — Argos

## Visão Geral

O Argos agora possui uma arquitetura em camadas que decide automaticamente qual caminho seguir para cada comando:

```
Transcrição (STT) → Router Híbrido → Executor → TTS
                        ↓
                    Fast Path? → ✓ Executa (50ms)
                        ↓
                    Intent Classifier? → ✓ Executa (100ms)
                        ↓
                    LLM Local? → ✓ Executa (500-2000ms)
                        ↓
                    Cloud? → ✓ Executa (1-3s)
```

## Arquitetura em Camadas

### 1. **Fast Path** (`services/router/fastPath.ts`)
- Regras determinísticas, zero latência
- Sem IA, sem rede
- Exemplos:
  - "Apaga a luz da sala" → Detecta: dispositivo "luz" + ação "apagar"
  - "Qual é o estado do ar?" → Detecta: dispositivo "ar" + query
- **Latência**: ~10-50ms

### 2. **Intent Classifier** (`services/router/intentClassifier.ts`)
- Padrões estruturados baseados em regex
- Extrai entities (dispositivo, ação, valor)
- Calcula confiança e cobertura
- Exemplos:
  - "Desliga o ar do quarto" → 0.9 confiança
  - "Apaga a luz e deixa um pouco de claridade" → 0.65 confiança (multi-intent)
- **Latência**: ~50-100ms

### 3. **Confidence & Coverage Gate** (`services/router/intentClassifier.ts`)
Antes de executar, valida:
- **Confidence**: Quão certo está da intenção? (0-1)
- **Coverage**: Quanto da frase entendeu? (0-1)
- **Required Slots**: Tem todos os parâmetros obrigatórios?
- **Ambiguities**: Existe mais de uma interpretação?
- **Unparsed Segments**: Tem partes não compreendidas?
- **Action Risk**: Qual o impacto da ação?
- **Context Dependency**: Depende de conversa anterior?
- **Multi-Intent**: Várias ações na mesma frase?

### 4. **Roteador Central** (`services/router/router.ts`)
Orquestra o fluxo:
1. Tenta Fast Path
2. Se falhar, tenta Intent Classifier
3. Se confiança alta → Executor local
4. Se confiança moderada → LLM Local
5. Se baixa confiança → Cloud

### 5. **Executor** (`services/router/executor.ts`)
Executa a intenção validando:
- Autenticação do usuário
- Permissões do dispositivo
- Validação de argumentos
- Tratamento de erros
- Confirmação de resultado antes de responder

### 6. **Tool Registry** (`services/router/toolRegistry.ts`)
Catálogo centralizado de ferramentas:
- Esquema de entrada/saída
- Nível de risco
- Permissões necessárias
- Timeout
- Idempotência

## Decisões de Roteamento

### FAST_PATH
**Quando**: Padrão simples detectado, confiança ≥ 95%
**O que**: Executa imediatamente sem IA
**Latência**: 50ms

```json
{
  "utterance": "apaga a luz da sala",
  "route": "FAST_PATH",
  "confidence": 0.95,
  "coverage": 1.0
}
```

### INTENT_LOCAL
**Quando**: Intent classificado com confiança ≥ 85%, cobertura ≥ 95%
**O que**: Executa com classificador local, depois tool calls
**Latência**: 100-150ms

```json
{
  "utterance": "apaga a luz da sala e deixa o corredor aceso",
  "route": "INTENT_LOCAL",
  "confidence": 0.88,
  "coverage": 0.92,
  "reason": "Intent classificado com alta confiança"
}
```

### LLM_LOCAL
**Quando**: Confiança moderada (50-85%), cobertura adequada (70-95%)
**O que**: Processa com LLM pequeno no dispositivo
**Latência**: 500-2000ms (depende do modelo)

```json
{
  "utterance": "quando eu sair de casa, apaga tudo",
  "route": "LLM_LOCAL",
  "confidence": 0.72,
  "coverage": 0.85,
  "reason": "Complexidade moderada, requer raciocínio"
}
```

### CLOUD
**Quando**: Baixa confiança (<50%) ou complexidade alta
**O que**: Envia para Claude/Anthropic API
**Latência**: 1-3s

```json
{
  "utterance": "como está o tráfego na avenida paulista",
  "route": "CLOUD",
  "confidence": 0.3,
  "coverage": 0.5,
  "reason": "Requer conhecimento externo, não é controle de dispositivo"
}
```

### CLARIFICATION
**Quando**: Ambiguidade detectada
**O que**: Pede ao usuário para ser mais específico
**Latência**: Depende da resposta

```json
{
  "utterance": "apaga a luz",
  "route": "CLARIFICATION",
  "reason": "Qual luz? Sala, quarto ou corredor?",
  "options": ["luz-sala", "luz-quarto", "luz-corredor"]
}
```

## Thresholds Configuráveis

```typescript
const DEFAULT_THRESHOLDS = {
  highConfidence: 0.85,      // ≥ este: pode executar
  lowConfidence: 0.5,        // < este: cloud
  minCoverage: 0.7,          // < este: parcial
  maxUnparsedLength: 50,     // ~10 palavras não compreendidas
};
```

## Permissões & Segurança

Antes de qualquer execução:

```
User Permission Check
       ↓
Device Permission Check
       ↓
Tool Call Validation
       ↓
Risk Level Assessment
       ↓
Execute or Deny
```

Exemplo:
```typescript
// Tool "turnLightOn" requer:
['device:control', 'device:light']

// Se usuário não tem, rejeita
```

## Métricas & Observabilidade

O Router registra:
- Rota escolhida
- Confiança
- Cobertura
- Latência de cada etapa
- Resultado final

Aggregate stats:
```typescript
{
  totalRequests: 1250,
  averageLatency: 145,
  routeDistribution: {
    FAST_PATH: 45%,      // 562
    INTENT_LOCAL: 35%,   // 437
    LLM_LOCAL: 15%,      // 187
    CLOUD: 5%            // 64
  },
  percentiles: {
    p50: 52,   // Fast path
    p95: 1200, // Cloud calls
    p99: 2800
  }
}
```

## Integração com Código Existente

### Hook Principal
```typescript
const { processUtterance, getMetrics } = useRouter();

// Usar:
const { decision, executionResult } = await processUtterance("apaga a luz");
```

### Com STT Existente
```typescript
// Em speechToText.ts ou em index.tsx (hook de voz)

speechEvent.on('transcription', async (utterance) => {
  const router = useRouter();
  const { decision, executionResult } = await router.processUtterance(utterance);

  if (decision.route === 'FAST_PATH') {
    // Resposta imediata, sem mais overhead
    speakResponse(executionResult.speech);
  } else if (decision.route === 'LLM_LOCAL' || decision.route === 'CLOUD') {
    // Encaminha para processamento existente
    handleWithLLM(utterance, decision);
  }
});
```

### Com API Cloud Existente
```typescript
// Decision.route === 'CLOUD'
// passa para api/chat.ts como antes

const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    model: 'claude-3-5-sonnet-20241022',
    system: buildSystemPrompt(...),
    messages: [{ role: 'user', content: utterance }]
  })
});
```

## Próximas Implementações

### Fase 1: Integração Básica (AGORA)
- ✅ Tipos e interfaces
- ✅ Fast Path
- ✅ Intent Classifier
- ✅ Router Central
- ✅ Executor
- ✅ Tool Registry
- ⏳ Integração com hooks existentes

### Fase 2: LLM Local
- Ollama + modelo pequeno (Phi-3, Mistral 7B)
- Quantização para ARM
- Cache de modelo em assets
- Download automático ao primeiro uso

### Fase 3: Adaptação de Hardware
- DeviceCapabilityProfile
- Seleção automática de estratégia (FAST_PATH_ONLY, HYBRID_LIGHT, HYBRID_LOCAL, CLOUD_FIRST)
- Fallback gracioso

### Fase 4: Automações Proativas
- Detecção de padrões
- Sugestão automática
- Consentimento explícito antes de autonomia

## Benchmark de Latência

| Route | Latência | Casos de Uso |
|-------|----------|-------------|
| FAST_PATH | 50ms | Ligar/desligar luz, status simples |
| INTENT_LOCAL | 100ms | Comandos com múltiplas entidades |
| LLM_LOCAL | 500-2000ms | Automações, conversação |
| CLOUD | 1-3s | Conhecimento externo, complexidade alta |

**Meta**: 95% das ações simples em < 100ms
