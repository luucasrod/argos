const MAX_TRACKED_COMMANDS = 200;

/**
 * `commandId` -> timestamp de quando a execução foi reivindicada. O Map
 * preserva ordem de inserção, então o mais antigo sai quando o cache enche.
 */
const claimedCommandIds = new Map<string, number>();

function trimOldestIfNeeded(): void {
  if (claimedCommandIds.size <= MAX_TRACKED_COMMANDS) return;
  const oldest = claimedCommandIds.keys().next().value;
  if (oldest !== undefined) claimedCommandIds.delete(oldest);
}

export function claimCommandExecution(commandId: string): boolean {
  if (claimedCommandIds.has(commandId)) return false;
  claimedCommandIds.set(commandId, Date.now());
  trimOldestIfNeeded();
  return true;
}

export function hasClaimedCommandExecution(commandId: string): boolean {
  return claimedCommandIds.has(commandId);
}

/** Só para teste — não é exportado no barrel de produção. */
export function __resetCommandExecutionIdempotencyForTest(): void {
  claimedCommandIds.clear();
}
