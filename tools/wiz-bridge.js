#!/usr/bin/env node
/**
 * Argos WiZ Bridge — corre este script no teu computador.
 * Uso: node tools/wiz-bridge.js
 * Não precisa de rede acessível — liga-se ao Supabase via internet.
 */

const { createClient } = require('@supabase/supabase-js');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SUPABASE_URL = 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b2tuZndmdmRxY25ic2lyd2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTYwOTUsImV4cCI6MjA5NjQzMjA5NX0.hanMyLtz-1kBLUoaqz9v9bzQ6Tr0PkXU6FYqQrsyXEY';

const WIZ_PORT = 38899;
const DISCOVER_TIMEOUT_MS = 3500;
const BRIDGE_ID_FILE = path.join(__dirname, '.bridge-id');

// ID persistente — gerado uma vez e guardado em tools/.bridge-id
let bridgeId;
try {
  bridgeId = fs.readFileSync(BRIDGE_ID_FILE, 'utf8').trim();
  if (!/^[a-f0-9]{8}$/.test(bridgeId)) throw new Error('inválido');
} catch {
  bridgeId = crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(BRIDGE_ID_FILE, bridgeId, 'utf8');
}

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (!iface.internal && iface.family === 'IPv4') return iface.address;
    }
  }
  return '0.0.0.0';
}

function udpSend(ip, message) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const buf = Buffer.from(JSON.stringify(message));
    socket.send(buf, 0, buf.length, WIZ_PORT, ip, (err) => {
      socket.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

function discoverDevices() {
  return new Promise((resolve) => {
    const devices = [];
    const localIp = getLocalIp();
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('error', () => resolve(devices));

    socket.on('message', (msg, rinfo) => {
      if (rinfo.address === localIp || rinfo.address === '127.0.0.1') return;
      try {
        const data = JSON.parse(msg.toString());
        const mac =
          (data.result && data.result.mac) || (data.params && data.params.mac);
        if (mac && !devices.find((d) => d.ip === rinfo.address)) {
          console.log('  Lâmpada encontrada:', rinfo.address, '(' + mac + ')');
          devices.push({ ip: rinfo.address, mac });
        }
      } catch (_) {}
    });

    socket.bind(WIZ_PORT, () => {
      try { socket.setBroadcast(true); } catch (_) {}
      const regMsg = JSON.stringify({
        method: 'registration',
        params: { phoneMac: 'AAAAAAAAAAAA', register: false, phoneIp: localIp },
      });
      const buf = Buffer.from(regMsg);
      socket.send(buf, 0, buf.length, WIZ_PORT, '255.255.255.255', () => {});
    });

    setTimeout(() => {
      try { socket.close(); } catch (_) {}
      resolve(devices);
    }, DISCOVER_TIMEOUT_MS);
  });
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const channelName = 'wiz:' + bridgeId;

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║           Argos — WiZ Bridge                 ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('  ID da ponte: ' + bridgeId);
  console.log('');
  console.log('  No Argos → Definições → Philips WiZ → WiFi Local');
  console.log('  Insere o ID acima e clica "Descobrir".');
  console.log('');
  console.log('  A ligar ao Supabase...');

  const channel = supabase.channel(channelName);

  channel
    .on('broadcast', { event: 'ping' }, async (msg) => {
      const id = msg.payload && msg.payload.id;
      await channel.send({
        type: 'broadcast',
        event: 'pong',
        payload: { id, ok: true },
      });
      console.log('[ping] respondido');
    })
    .on('broadcast', { event: 'scan' }, async (msg) => {
      const id = msg.payload && msg.payload.id;
      console.log('[scan] A procurar lâmpadas WiZ na rede local...');
      try {
        const devices = await discoverDevices();
        console.log('[scan] Encontradas:', devices.length);
        await channel.send({
          type: 'broadcast',
          event: 'scan-result',
          payload: { id, devices },
        });
      } catch (err) {
        await channel.send({
          type: 'broadcast',
          event: 'scan-result',
          payload: { id, devices: [], error: err.message },
        });
      }
    })
    .on('broadcast', { event: 'control' }, async (msg) => {
      const ip = msg.payload && msg.payload.ip;
      const params = msg.payload && msg.payload.params;
      if (!ip || !params) return;
      try {
        await udpSend(ip, { method: 'setPilot', params });
        console.log('[control]', ip, JSON.stringify(params));
      } catch (err) {
        console.error('[control] Erro:', err.message);
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('  ✓ Ligado! Pronto para receber comandos do Argos.');
        console.log('  Ctrl+C para parar.');
        console.log('');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('  ✗ Erro ao ligar ao Supabase. Verifica a ligação à internet.');
      }
    });
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
