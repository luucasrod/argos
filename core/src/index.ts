/**
 * Argos Core — ponto de entrada.
 * Expõe HTTP + WebSocket para o app mobile se conectar via rede local.
 *
 * FASE 6-8 do Prompt Master Argos.
 */
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { router as apiRouter } from './routes/api';
import { initKeyboard } from './keyboard/keyboard';
import { initClipboard } from './clipboard/clipboard';
import { AuthManager } from './auth/authManager';
import { broadcastDeviceState } from './ws/wsServer';

const PORT = process.env.ARGOS_CORE_PORT ? parseInt(process.env.ARGOS_CORE_PORT) : 4222;

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const auth = new AuthManager();
app.use('/api', auth.middleware(), apiRouter);
app.get('/ping', (_req, res) => res.json({ ok: true, version: '1.0.0' }));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const token = new URL(req.url ?? '', 'http://x').searchParams.get('token');
  if (!auth.verify(token)) {
    ws.close(4401, 'unauthorized');
    return;
  }
  console.log('[argos-core] WebSocket conectado');
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleWsCommand(ws, msg);
    } catch {
      ws.send(JSON.stringify({ error: 'invalid_json' }));
    }
  });
});

function handleWsCommand(ws: import('ws'), msg: { type: string; payload?: unknown }) {
  const send = (data: unknown) => ws.send(JSON.stringify(data));
  switch (msg.type) {
    case 'ping':
      send({ type: 'pong' });
      break;
    default:
      send({ type: 'error', code: 'unknown_command' });
  }
}

initKeyboard();
initClipboard();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[argos-core] Ouvindo em http://0.0.0.0:${PORT}`);
  console.log(`[argos-core] Token: ${auth.getToken()}`);
});

// Exporta para uso em testes
export { broadcastDeviceState };
