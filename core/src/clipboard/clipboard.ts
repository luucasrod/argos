/**
 * Leitura/escrita de clipboard via robotjs ou fallback pbcopy/xclip.
 * FASE 8 do Prompt Master.
 */
import { execSync } from 'child_process';
import os from 'os';

let robot: typeof import('robotjs') | null = null;

export function initClipboard(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    robot = require('robotjs') as typeof import('robotjs');
  } catch {}
}

export function getClipboard(): string {
  if (robot) {
    // robotjs não expõe leitura de clipboard diretamente — usa comando do OS
  }
  try {
    const platform = os.platform();
    if (platform === 'win32') {
      return execSync('powershell Get-Clipboard', { encoding: 'utf-8' }).trim();
    } else if (platform === 'darwin') {
      return execSync('pbpaste', { encoding: 'utf-8' }).trim();
    } else {
      return execSync('xclip -selection clipboard -o', { encoding: 'utf-8' }).trim();
    }
  } catch {
    return '';
  }
}

export function setClipboard(text: string): boolean {
  try {
    const platform = os.platform();
    if (platform === 'win32') {
      execSync(`echo ${text.replace(/"/g, '\\"')} | clip`);
    } else if (platform === 'darwin') {
      execSync(`echo '${text.replace(/'/g, "'\\''")}' | pbcopy`);
    } else {
      execSync(`echo '${text.replace(/'/g, "'\\''")}' | xclip -selection clipboard`);
    }
    return true;
  } catch {
    return false;
  }
}
