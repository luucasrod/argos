/**
 * api/wiz-devices.ts
 *
 * GET /api/wiz-devices  (requer header x-ha-key)
 * Resp: { devices: Array<{ mac: string; name: string }> }
 *
 * Usado pelo Jarvis PC para mapear MAC → nome dos dispositivos WiZ,
 * combinando com o scan de subnet local (IP → MAC) para controle
 * direto via UDP sem passar pelo Argos a cada comando.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { wizListDevices } from './_lib/wiz';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-ha-key');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const haKey = req.headers['x-ha-key'] as string | undefined;
  if (!haKey) return res.status(401).json({ error: 'Missing x-ha-key header' });

  const { data: keyData } = await supabaseAdmin
    .from('ha_keys')
    .select('user_id')
    .eq('api_key', haKey)
    .maybeSingle();

  if (!keyData) return res.status(401).json({ error: 'Invalid API key' });

  const userId = keyData.user_id as string;

  const { data: wizRow } = await supabaseAdmin
    .from('wiz_accounts')
    .select('access_token, home_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!wizRow) return res.json({ devices: [] });

  const row = wizRow as { access_token: string; home_id: string | null };
  const lights = await wizListDevices(row.access_token, row.home_id ?? '');
  const devices = lights.map((l) => ({ mac: l.mac.toLowerCase(), name: l.name.trim() }));

  return res.json({ devices });
}
