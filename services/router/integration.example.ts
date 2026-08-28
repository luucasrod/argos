/**
 * EXEMPLO DE INTEGRAÇÃO — Como usar a arquitetura híbrida
 *
 * Este arquivo mostra como integrar o novo sistema de roteamento
 * com o fluxo de voz existente do Argos
 */

// ============ FLUXO COMPLETO ============
//
// 1. Usuário fala:
//    "Argos, apaga a luz da sala"
//
// 2. STT transcreve → "apaga a luz da sala"
//
// 3. Router processa:
//    - Fast Path tenta match → encontra dispositivo "luz da sala" + ação "apagar"
//    - Retorna FAST_PATH com confidence 0.95
//
// 4. Executor valida e executa:
//    - Verifica permissão device:control
//    - Chama useDeviceStore.updateDevice()
//    - Retorna sucesso
//
// 5. TTS fala: "Pronto."
//
// Latência total: ~50ms (sem IA, sem cloud)
//
// ============ CASO COMPLEXO ============
//
// 1. Usuário fala:
//    "Apaga a luz da sala e deixa a do corredor em 50% de brilho"
//
// 2. STT transcreve
//
// 3. Router processa:
//    - Fast Path falha (tem palavra "cor" + mudança de brilho)
//    - Intent Classifier tenta → 0.65 confidence (multi-intent)
//    - Retorna LLM_LOCAL
//
// 4. LLM local (ou cloud) processa:
//    - "Oh, duas ações na mesma frase"
//    - Extrai: apagar luz da sala + 50% brilho corredor
//    - Retorna JSON estruturado
//
// 5. Executor executa ambas
//
// 6. TTS fala: "Pronto, sala apagada e corredor em 50%"
//
// ============ OFFLINE FALLBACK ============
//
// Se LLM local/cloud falhar → tenta novamente com cloud
// Se cloud falhar → pede clarificação ao usuário
// Se é offline → segue só com fast path
//

import { useRouter, useToolCalling } from '@/hooks/useRouter';
import { useAIStore } from '@/stores/useAIStore';
import { useDeviceStore } from '@/stores/useDeviceStore';

/**
 * Exemplo de integração com o hook existente useArgos
 * (presume-se que useArgos.processVoiceInput() existe)
 */
export async function exampleIntegration() {
  // 1. Setup
  const router = useRouter();
  const toolCalling = useToolCalling();
  const aiStore = useAIStore();
  const deviceStore = useDeviceStore();

  // 2. Simula transcrição do usuário
  const utterance = 'apaga a luz da sala';

  // 3. Processa via router
  const { decision, executionResult, metrics } = await router.processUtterance(utterance, {
    verbose: true,
  });

  console.log('Routing decision:', decision.route);
  console.log('Intent type:', decision.intent.type);
  console.log('Confidence:', decision.intent.confidence);
  console.log('Execution result:', executionResult);

  // 4. Update UI based on route
  if (decision.route === 'FAST_PATH' || decision.route === 'INTENT_LOCAL') {
    if (executionResult?.success) {
      // Executado localmente, notifica usuário
      // aiStore.addMessage({...}); // Exemplo, tipos precisam de ajuste

      // TTS fala
      // await textToSpeech(executionResult.speech);
    }
  } else if (decision.route === 'LLM_LOCAL') {
    // Aguarda processamento do LLM local
    aiStore.setStatus('processing' as any);
    // ... chamar LLM local ...
  } else if (decision.route === 'CLOUD') {
    // Precisa de cloud
    aiStore.setStatus('calling_api' as any);
    // ... chamar API cloud ...
  }
}

/**
 * Exemplo de validação de tool calling
 */
export function exampleToolValidation() {
  const toolCalling = useToolCalling();

  // Usuário quer: "Liga a luz da sala"
  // LLM quer chamar: turnLightOn(deviceId: "light-living-room")

  const userPermissions = ['device:control', 'device:light', 'device:query'];

  const validation = toolCalling.validateToolCall('turnLightOn',
    { deviceId: 'light-living-room' },
    userPermissions
  );

  if (validation.valid) {
    console.log('Tool call approved');
    // Executar tool
  } else {
    console.log('Tool call rejected:', validation.error);
    // Retornar erro para LLM
  }
}

/**
 * Exemplo de integração com STT existente
 */
export async function integrateWithExistingSTT() {
  const router = useRouter();

  // Presume que algum serviço de STT já fornece:
  // - speechToText.ts já existe
  // - transcrição é entregue por evento/callback

  // Integração seria assim:
  //
  // speechToText.on('transcription', async (utterance) => {
  //   const { decision, executionResult } = await router.processUtterance(utterance);
  //
  //   if (decision.route === 'FAST_PATH' || decision.route === 'INTENT_LOCAL') {
  //     // Execução imediata, TTS já sabe o que falar
  //     if (executionResult?.speech) {
  //       await textToSpeech(executionResult.speech);
  //     }
  //   } else {
  //     // Encaminha para processamento posterior
  //     handleCloudProcessing(utterance, decision);
  //   }
  // });
}

/**
 * Estrutura de permissões padrão
 */
export const DEFAULT_USER_PERMISSIONS = [
  // Device control
  'device:control',
  'device:light',
  'device:switch',
  'device:airconditioning',

  // Device query
  'device:query',

  // Automation
  'automation:create',
  'automation:manage',

  // External services
  'external:weather',
  'external:music',

  // Personal data
  'memory:write',
  'memory:read',
];

/**
 * Thresholds configuráveis por usuário/dispositivo
 */
export const PERFORMANCE_PROFILES = {
  // Para dispositivos rápidos, mais uso de IA local
  fast: {
    highConfidence: 0.85,
    lowConfidence: 0.5,
    minCoverage: 0.7,
    maxUnparsedLength: 50,
  },

  // Balanceado
  balanced: {
    highConfidence: 0.85,
    lowConfidence: 0.5,
    minCoverage: 0.7,
    maxUnparsedLength: 50,
  },

  // Para dispositivos lentos, mais direto para cloud
  slow: {
    highConfidence: 0.95, // precisa de MUI alta
    lowConfidence: 0.3, // threshold menor, manda mais pra cloud
    minCoverage: 0.8,
    maxUnparsedLength: 30,
  },

  // Offline-first, prioriza execução local
  offlineFirst: {
    highConfidence: 0.7, // threshold baixo, tira risco
    lowConfidence: 0.3,
    minCoverage: 0.5,
    maxUnparsedLength: 100,
  },
};
