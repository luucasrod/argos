/**
 * wakeWordEngine.ts — contrato do motor de wake word (issue A-003).
 *
 * Existe para o resto do app (hooks, telas) depender de uma interface, não de
 * um motor específico. Trocar de motor no futuro deve significar só trocar o
 * binding em `wakeWordEngine.native.ts`, não reescrever quem consome.
 *
 * Este arquivo é puro contrato: nenhuma dependência de STT externo, LLM,
 * controle de dispositivos ou mídia mora aqui, só a forma.
 */

/** Disparado quando a wake word é reconhecida. */
export type WakeDetectedEvent = {
  /** Epoch ms de quando o motor detectou a wake word. */
  at: number;
  /**
   * Dados extras do motor específico (ex.: confidence de um classificador).
   * O motor atual (Vosk) não produz um score — é casamento contra gramática
   * fechada, não classificação —, então normalmente vem ausente. Fica
   * opcional para não forçar todo motor a inventar um número que não tem.
   */
  metadata?: Record<string, unknown>;
};

export type WakeWordEngineOptions = {
  wakeWord: string;
  /** Nomes de dispositivos e cômodos, para motores com vocabulário fechado. */
  extraPhrases?: string[];
  /** A wake word foi reconhecida — hora de dar retorno (bipe/UI). */
  onWakeDetected: (event: WakeDetectedEvent) => void;
  /** Comando completo, já sem a wake word, pronto para a IA. */
  onCommand: (text: string) => void;
  /** Transcrição parcial em curso, para mostrar na tela. */
  onPartial?: (text: string) => void;
};

/**
 * Contrato mínimo para trocar o motor de wake word sem tocar em quem o usa.
 * Detecta a wake word e, quando o próprio motor já faz isso na mesma
 * passada (caso do Vosk, que reconhece wake word + comando numa fala só),
 * também entrega o comando via `onCommand`.
 */
export interface WakeWordEngine {
  start(opts: WakeWordEngineOptions): Promise<boolean>;
  stop(): Promise<void>;
  suspend(): void;
  resume(): void;
  isRunning(): boolean;
  isSuspended(): boolean;
  /** Arma a captura de comando manualmente (ex.: toque no orb), sem esperar a wake word. */
  armUtterance(): boolean;
  /** Descarta a captura em curso e volta a vigiar só a wake word. */
  cancelUtterance(): void;
  isArmed(): boolean;
}
