/**
 * Rotas REST do Argos Core.
 * Todas requerem autenticação Bearer (aplicada no index.ts antes do mount).
 */
import { Router } from 'express';
import { executeKeyCommand, KeyCommand } from '../keyboard/keyboard';
import { getClipboard, setClipboard } from '../clipboard/clipboard';
import os from 'os';
import { execSync } from 'child_process';

export const router = Router();

// ─── Teclado ──────────────────────────────────────────────────────────────────

router.post('/keyboard', (req, res) => {
  const cmd = req.body as KeyCommand;
  if (!cmd?.type) {
    res.status(400).json({ error: 'missing_type' });
    return;
  }
  const result = executeKeyCommand(cmd);
  res.json(result);
});

// ─── Clipboard ────────────────────────────────────────────────────────────────

router.get('/clipboard', (_req, res) => {
  res.json({ text: getClipboard() });
});

router.post('/clipboard', (req, res) => {
  const { text } = req.body as { text?: string };
  if (typeof text !== 'string') {
    res.status(400).json({ error: 'missing_text' });
    return;
  }
  res.json({ ok: setClipboard(text) });
});

// ─── Sistema ──────────────────────────────────────────────────────────────────

router.get('/system/info', (_req, res) => {
  res.json({
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    freemem: os.freemem(),
    totalmem: os.totalmem(),
  });
});

router.post('/system/command', (req, res) => {
  const { command } = req.body as { command?: string };
  // Lista de comandos permitidos — NUNCA execute comandos arbitrários.
  const ALLOWED = [
    'lock', 'sleep', 'volume_up', 'volume_down', 'volume_mute',
    'media_play_pause', 'media_next', 'media_prev',
  ] as const;
  type AllowedCommand = (typeof ALLOWED)[number];

  if (!command || !ALLOWED.includes(command as AllowedCommand)) {
    res.status(400).json({ error: 'command_not_allowed', allowed: ALLOWED });
    return;
  }

  try {
    const platform = os.platform();
    if (platform === 'win32') {
      const winCommands: Record<AllowedCommand, string> = {
        lock: 'rundll32 user32.dll,LockWorkStation',
        sleep: 'rundll32 powrprof.dll,SetSuspendState 0,1,0',
        volume_up: 'powershell (New-Object -com WScript.Shell).SendKeys([char]175)',
        volume_down: 'powershell (New-Object -com WScript.Shell).SendKeys([char]174)',
        volume_mute: 'powershell (New-Object -com WScript.Shell).SendKeys([char]173)',
        media_play_pause: 'powershell (New-Object -com WScript.Shell).SendKeys([char]179)',
        media_next: 'powershell (New-Object -com WScript.Shell).SendKeys([char]176)',
        media_prev: 'powershell (New-Object -com WScript.Shell).SendKeys([char]177)',
      };
      execSync(winCommands[command as AllowedCommand]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});
