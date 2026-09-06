/**
 * api/devices/[provider].ts — dispatcher único para os 8 endpoints de
 * integração de dispositivo (era 8 arquivos separados em api/, cada um uma
 * Serverless Function própria).
 *
 * Por quê: o plano Hobby do Vercel só permite 12 Serverless Functions por
 * deployment, e o projeto passou disso ("No more than 12 Serverless
 * Functions can be added..."), bloqueando TODO deploy — não só o de voz.
 * Cada arquivo de rota dinâmica ([provider].ts) conta como UMA função, não
 * importa quantos valores de `provider` ela atenda — mesma lógica que
 * `api/ewelink.ts` já usava internamente (`?action=`) antes de virar rota
 * dinâmica também, só que agora entre arquivos em vez de dentro de um.
 *
 * A lógica de cada provedor não mudou uma linha — só foi movida de
 * `api/<provider>.ts` para `api/_lib/handlers/<provider>.ts` (fora de
 * `api/devices/`, então não conta como função própria) e importada aqui.
 *
 * URLs antigas (`/api/wiz`, `/api/tapo`, ...) continuam funcionando: ver os
 * rewrites em `vercel.json`, que redirecionam pra `/api/devices/<provider>`
 * sem o cliente precisar mudar nada.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import amazonHandler from '../_lib/handlers/amazon';
import chromeHandler from '../_lib/handlers/chrome';
import ewelinkHandler from '../_lib/handlers/ewelink';
import tapoHandler from '../_lib/handlers/tapo';
import tuyaHandler from '../_lib/handlers/tuya';
import wizHandler from '../_lib/handlers/wiz';
import xiaomiHandler from '../_lib/handlers/xiaomi';
import xiaomiPetHandler from '../_lib/handlers/xiaomi-pet';

const HANDLERS: Record<
  string,
  (req: VercelRequest, res: VercelResponse) => Promise<void | VercelResponse>
> = {
  amazon: amazonHandler,
  chrome: chromeHandler,
  ewelink: ewelinkHandler,
  tapo: tapoHandler,
  tuya: tuyaHandler,
  wiz: wizHandler,
  xiaomi: xiaomiHandler,
  'xiaomi-pet': xiaomiPetHandler,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const provider = req.query.provider as string | undefined;
  const target = provider ? HANDLERS[provider] : undefined;
  if (!target) {
    return res.status(404).json({ error: 'unknown_provider', provider });
  }
  return target(req, res);
}
