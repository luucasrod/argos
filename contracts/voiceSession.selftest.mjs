import {
  VOICE_SESSION_V2_FLAG_KEY,
  isToolCall,
  isToolResult,
} from './voiceSession.v1.ts';

// AsyncStorage não existe fora do RN — testa só os type guards puros aqui.
// O round-trip do flag em si (isVoiceSessionV2Enabled/setVoiceSessionV2Enabled)
// precisa rodar dentro do app (depende de @react-native-async-storage/async-storage).

if (typeof VOICE_SESSION_V2_FLAG_KEY !== 'string' || VOICE_SESSION_V2_FLAG_KEY.length === 0) {
  throw new Error('VOICE_SESSION_V2_FLAG_KEY deve ser uma string não vazia.');
}

const validToolCall = { id: 'call-1', name: 'device_control', input: { deviceId: 'luz-escritorio' } };
if (!isToolCall(validToolCall)) {
  throw new Error('isToolCall rejeitou um ToolCall válido.');
}
if (isToolCall({ id: 'call-1', name: 'device_control' })) {
  throw new Error('isToolCall aceitou um objeto sem `input`.');
}
if (isToolCall(null) || isToolCall('call-1')) {
  throw new Error('isToolCall aceitou um valor que não é objeto.');
}

const validToolResult = { toolCallId: 'call-1', ok: true, data: { state: 'on' } };
if (!isToolResult(validToolResult)) {
  throw new Error('isToolResult rejeitou um ToolResult válido.');
}
const validToolResultError = { toolCallId: 'call-1', ok: false, error: 'device_offline' };
if (!isToolResult(validToolResultError)) {
  throw new Error('isToolResult rejeitou um ToolResult de erro válido.');
}
if (isToolResult({ toolCallId: 'call-1' })) {
  throw new Error('isToolResult aceitou um objeto sem `ok`.');
}

console.log('Contract self-test passed.');
