/**
 * Helpers de broadcast WebSocket para notificar o app mobile de mudanças de estado.
 */
import { WebSocketServer, WebSocket } from 'ws';

let _wss: WebSocketServer | null = null;

export function setWss(wss: WebSocketServer): void {
  _wss = wss;
}

export function broadcastDeviceState(deviceId: string, state: Record<string, unknown>): void {
  if (!_wss) return;
  const msg = JSON.stringify({ type: 'device_state', deviceId, state });
  _wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

export function broadcastEvent(type: string, payload: unknown): void {
  if (!_wss) return;
  const msg = JSON.stringify({ type, payload });
  _wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}
