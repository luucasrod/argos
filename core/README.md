# Argos Core

Serviço Node.js que roda no PC e expõe teclado, clipboard e controles do sistema ao app mobile Argos via HTTP + WebSocket.

## Setup

```bash
cd core
npm install
npm run build
npm start
```

Na primeira execução, o token de autenticação é gerado em `%APPDATA%\argos-core\token.txt`. Configure o mesmo token no app (Settings → Argos Core).

## Instalar como serviço (Windows)

```bash
# Como Administrador
npm run build
node scripts/install-service.js
```

O serviço inicia automaticamente no logon e reinicia em caso de falha.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /ping | Health check (sem auth) |
| POST | /api/keyboard | Simula tecla/combo/texto |
| GET | /api/clipboard | Lê clipboard |
| POST | /api/clipboard | Escreve clipboard |
| GET | /api/system/info | Info do PC |
| POST | /api/system/command | Comando do sistema (lock, sleep, volume…) |

## WebSocket

Conecte em `ws://localhost:4222/ws?token=<TOKEN>` para receber eventos em tempo real (mudança de estado de dispositivo, notificações).

## Porta

Padrão: **4222**. Mude com `ARGOS_CORE_PORT=XXXX node dist/index.js`.
