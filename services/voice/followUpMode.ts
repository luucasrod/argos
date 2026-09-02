/**
 * followUpMode.ts — sinaliza entre hooks/useArgos.ts e hooks/useVoice.ts que
 * a última resposta falada pelo Argos era uma pergunta que espera resposta
 * do usuário (B-031, `ParsedIntent.expectsResponse`), sem passar por
 * `stores/` (zona do Codex).
 *
 * Mesmo padrão de services/voice/voiceSession.ts (registerVoicePause):
 * módulo simples de estado compartilhado entre dois hooks que não têm
 * relação direta de props entre si.
 */
let awaitingFollowUp = false;

/** Chamado por useArgos.ts ao processar um intent com expectsResponse=true. */
export function markAwaitingFollowUp(): void {
  awaitingFollowUp = true;
}

/**
 * Lê e reseta a flag numa só operação — uso único por transição de status.
 * Sem o reset aqui, uma transição pra idle não relacionada, mais tarde,
 * reaproveitaria uma marca antiga e armaria escuta sem pergunta nenhuma.
 */
export function consumeAwaitingFollowUp(): boolean {
  const was = awaitingFollowUp;
  awaitingFollowUp = false;
  return was;
}
