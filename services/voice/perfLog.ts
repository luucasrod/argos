/**
 * perfLog.ts — mede onde o tempo é gasto entre o fim da fala e o áudio de
 * resposta terminar de tocar.
 *
 * Por que existe: o usuário relata que "o Argos demora pra responder" e
 * ninguém tinha medido onde o tempo ia — STT, LLM, TTS ou rede. Sem isso,
 * qualquer otimização era chute (issue #14).
 *
 * Fica LIGADO de propósito, sem gate de __DEV__: só a build de produção (o
 * APK real, não o Expo Go/dev client) reflete a latência de rede real do
 * usuário. Segue a mesma escolha de `vlog` em voskWakeWord.native.ts. Ler no
 * logcat com a tag ReactNativeJS, prefixo [argos-perf].
 */

type Mark = { label: string; t: number };

let marks: Mark[] = [];
let turnId = 0;
let active = false;

function log(msg: string): void {
  console.log('[argos-perf] ' + msg);
}

/** Abre um novo turno de medição (ex: fim da fala detectado). */
export function perfStart(reason: string): void {
  turnId += 1;
  marks = [{ label: reason, t: Date.now() }];
  active = true;
  log(`#${turnId} inicio: ${reason}`);
}

/** Registra um marco dentro do turno aberto. Sem turno aberto, não faz nada. */
export function perfMark(label: string): void {
  if (!active) return;
  const t = Date.now();
  const prev = marks[marks.length - 1].t;
  marks.push({ label, t });
  log(`#${turnId} ${label}: +${t - prev}ms (total ${t - marks[0].t}ms)`);
}

/** Fecha o turno e imprime o resumo com todas as etapas lado a lado. */
export function perfEnd(label: string): void {
  if (!active) return;
  perfMark(label);
  active = false;

  const total = marks[marks.length - 1].t - marks[0].t;
  const etapas = marks
    .slice(1)
    .map((m, i) => `${m.label}=${m.t - marks[i].t}ms`)
    .join(' | ');
  log(`#${turnId} TOTAL ${total}ms — ${etapas}`);
}

/** Cancela o turno em aberto sem imprimir resumo (ex: usuário digitou em vez de falar). */
export function perfAbort(): void {
  active = false;
}
