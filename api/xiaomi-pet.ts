/**
 * api/xiaomi-pet.ts — Endpoint para dispositivos Xiaomi Pet
 * Reutiliza a autenticação Xiaomi já estabelecida
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getUserFromAuthHeader,
  xiaomiListFans,
  xiaomiSetProperty,
  getXiaomiAccount,
  supabaseAsUser,
} from './_lib/xiaomi';
import {
  xiaomiGetPetSpec,
  detectPetDeviceType,
  XiaomiPetDeviceDto,
} from './_lib/xiaomi-pet';

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;
  const authHeader = req.headers.authorization as string | undefined;

  try {
    // ─── DEVICES (usa autenticação Xiaomi existente) ───
    if (req.method === 'GET' && action === 'devices') {
      const auth = await getUserFromAuthHeader(authHeader ?? null);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Não autenticado' });
      }

      try {
        const account = await getXiaomiAccount(auth.user.id, auth.token);
        if (!account) {
          return res.status(200).json({ connected: false, devices: [] });
        }

        // Reutiliza a mesma sessão Xiaomi
        const { region, devices: fans } = await xiaomiListFans(account.session, account.region);

        // Filtra apenas dispositivos pet e mapeia
        const petDevices: XiaomiPetDeviceDto[] = [];
        for (const fan of fans) {
          const deviceType = detectPetDeviceType(fan.model);
          if (deviceType === 'other-pet') continue; // Skip não-pet

          const petSpec = await xiaomiGetPetSpec(fan.model);
          petDevices.push({
            did: fan.did,
            name: fan.name,
            model: fan.model,
            deviceType,
            isOnline: fan.isOnline,
            isOn: fan.isOn,
            feedAmountValue: undefined,
            waterLevelValue: undefined,
            wasteLevelValue: undefined,
            power: petSpec?.power,
            feedAmount: petSpec?.feedAmount,
            feedingSchedule: petSpec?.feedingSchedule,
            waterLevel: petSpec?.waterLevel,
            wasteLevel: petSpec?.wasteLevel,
            cleaningMode: petSpec?.cleaningMode,
            lightControl: petSpec?.lightControl,
            temperature: petSpec?.temperature,
          });
        }

        return res.status(200).json({ connected: true, devices: petDevices });
      } catch (err) {
        console.error('[xiaomi-pet] Falha ao listar dispositivos:', err);
        return res.status(200).json({ connected: false, devices: [] });
      }
    }

    // ─── CONTROL (envia comando via Xiaomi) ───
    if (req.method === 'POST' && action === 'control') {
      const auth = await getUserFromAuthHeader(authHeader ?? null);
      if (!auth?.user) {
        return res.status(401).json({ error: 'Não autenticado' });
      }

      const { did, siid, piid, value } = req.body as {
        did: string;
        siid: number;
        piid: number;
        value: unknown;
      };

      try {
        const account = await getXiaomiAccount(auth.user.id, auth.token);
        if (!account) {
          return res.status(401).json({ error: 'Xiaomi não conectado' });
        }

        await xiaomiSetProperty(account.session, account.region, did, siid, piid, value);

        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('[xiaomi-pet] Falha ao controlar dispositivo:', err);
        return res.status(500).json({ error: String(err) });
      }
    }

    return res.status(400).json({ error: 'Action não suportada' });
  } catch (err) {
    console.error('[xiaomi-pet] erro:', err);
    return res.status(500).json({ error: String(err) });
  }
}
