/**
 * nativeVad.ts — detecção de fala (VAD) por volume, para o metering do expo-audio.
 *
 * Por que não dá pra usar um limite fixo: no Android o expo-audio converte a
 * amplitude com `20 * Math.log(amplitude / 32767)` (AVManager.java) — e
 * `Math.log` é logaritmo NATURAL, não log10. O valor reportado sai cerca de
 * 2,3x mais negativo que dBFS de verdade. Na prática, no Android:
 *   silêncio absoluto ... -160
 *   ambiente silencioso . -90 a -120
 *   fala perto do aparelho -50 a -20
 * No iOS o metering é dBFS real (fala ~ -30 a -5). Daí os limites por
 * plataforma abaixo, e o piso de ruído adaptativo — que é o que faz funcionar
 * em ambientes diferentes sem recalibrar na mão.
 */
import { Platform } from 'react-native';

/** Abaixo disto nunca conta como fala, independente do piso de ruído. */
const ABSOLUTE_FLOOR = Platform.OS === 'android' ? -95 : -45;

/** Quanto o sinal precisa subir acima do piso de ruído para contar como fala. */
const SPEECH_MARGIN = Platform.OS === 'android' ? 18 : 8;

/** Velocidade de adaptação do piso de ruído (0..1). */
const FLOOR_ADAPT = 0.06;

const SILENT = -160;

export interface Vad {
  /** Alimenta uma leitura de metering; devolve true se é fala. */
  push: (metering: number | undefined) => boolean;
  /** Piso de ruído estimado no momento (para diagnóstico). */
  floor: () => number;
}

export function createVad(): Vad {
  let noiseFloor = SILENT;

  return {
    push: (metering) => {
      // metering ausente = plataforma não reportou; trata como silêncio para
      // não disparar gravação/transcrição à toa.
      if (typeof metering !== 'number' || !Number.isFinite(metering)) return false;

      const speaking = metering > ABSOLUTE_FLOOR && metering > noiseFloor + SPEECH_MARGIN;

      if (!speaking) {
        // Só adapta o piso durante silêncio, senão a própria fala levanta o piso
        // e o VAD para de detectar depois de alguns segundos.
        noiseFloor =
          noiseFloor === SILENT ? metering : noiseFloor + (metering - noiseFloor) * FLOOR_ADAPT;
      }

      return speaking;
    },
    floor: () => noiseFloor,
  };
}
