/**
 * Controle de teclado via robotjs.
 * FASE 7 do Prompt Master: permite que o Argos simule teclas no PC.
 */
let robot: typeof import('robotjs') | null = null;

export function initKeyboard(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    robot = require('robotjs') as typeof import('robotjs');
    console.log('[argos-core] robotjs carregado — controle de teclado ativo');
  } catch {
    console.warn('[argos-core] robotjs não instalado — controle de teclado desabilitado');
  }
}

export type KeyCommand =
  | { type: 'tap'; key: string; modifiers?: string[] }
  | { type: 'type'; text: string }
  | { type: 'combo'; keys: string[] };

export function executeKeyCommand(cmd: KeyCommand): { ok: boolean; error?: string } {
  if (!robot) return { ok: false, error: 'keyboard_unavailable' };
  try {
    switch (cmd.type) {
      case 'tap':
        robot.keyTap(cmd.key, cmd.modifiers as never ?? []);
        break;
      case 'type':
        robot.typeString(cmd.text);
        break;
      case 'combo':
        if (cmd.keys.length < 2) return { ok: false, error: 'combo_needs_2_keys' };
        robot.keyTap(cmd.keys[cmd.keys.length - 1], cmd.keys.slice(0, -1) as never);
        break;
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
