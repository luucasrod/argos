/**
 * wakeWordEngine.native.ts — binding: qual motor de wake word está ativo.
 *
 * Único lugar que decide isso (issue A-003, critério de aceite: "trocar
 * engine no futuro exige alterar apenas binding/configuração"). Quem
 * consome (hooks/useVoice.ts) importa `wakeWordEngine` daqui e nunca um
 * motor específico diretamente.
 */
import { voskWakeWordEngine } from './voskWakeWordEngine.native';
import type { WakeWordEngine } from './wakeWordEngine';

export const wakeWordEngine: WakeWordEngine = voskWakeWordEngine;
