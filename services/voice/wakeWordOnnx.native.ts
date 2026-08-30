/**
 * wakeWordOnnx.native.ts — wrapper fino sobre o módulo nativo `WakeWord`
 * (android/app/src/main/java/com/masya/argos/modules/WakeWordModule.kt),
 * que roda o modelo openWakeWord "hey argos" (treinado via Colab, ver
 * Contexto.md do projeto) local via ONNX Runtime.
 *
 * Estrutura pronta, integração PENDENTE: falta (1) copiar os 3 `.onnx`
 * (melspectrogram, embedding_model, hey_argos) pra
 * `android/app/src/main/assets/`, e (2) plugar a janela deslizante de
 * embeddings no loop de captura que hoje já existe em
 * `voskWakeWord.native.ts` (mesmo `AudioRecord`, nunca fechado — não criar
 * um segundo stream de áudio, isso já foi tentado e derruba o mic em
 * background, ver "Já tentado e FALHOU" no Contexto.md).
 */
import { NativeModules } from 'react-native';

const { WakeWord } = NativeModules;

export async function loadWakeWordModel(): Promise<boolean> {
  if (!WakeWord) return false;
  return WakeWord.load();
}

export async function isWakeWordModelLoaded(): Promise<boolean> {
  if (!WakeWord) return false;
  return WakeWord.isLoaded();
}

/** `samples`: PCM 16kHz mono, float32 normalizado (-1..1). */
export async function computeWakeWordEmbedding(samples: Float32Array): Promise<number[]> {
  if (!WakeWord) return [];
  return WakeWord.computeEmbedding(Array.from(samples));
}

/** `embeddingWindow`: últimos N vetores de embedding concatenados. */
export async function scoreWakeWord(embeddingWindow: number[]): Promise<number> {
  if (!WakeWord) return 0;
  return WakeWord.score(embeddingWindow);
}

export async function unloadWakeWordModel(): Promise<void> {
  if (!WakeWord) return;
  await WakeWord.unload();
}
