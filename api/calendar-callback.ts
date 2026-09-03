import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin, exchangeGoogleCalendarCode, decodeState } from './_lib/googleCalendar';
import { REDIRECT_URI, NATIVE_REDIRECT, WEB_REDIRECT } from './_lib/googleCalendarConfig';

/**
 * Google redireciona pra cá com ?code&state — sem sessão do usuário (é o
 * navegador do Google batendo no nosso servidor, não o app). O exchange do
 * client secret acontece inteiramente aqui; o app nunca vê o `code` nem o
 * token bruto trocado, só o resultado final (redirect de volta pro app/PWA).
 *
 * Rota separada de api/calendar.ts (não `?action=callback` no mesmo arquivo)
 * porque o URI já foi cadastrado assim no client OAuth do Google Cloud
 * Console — mudar exigiria voltar lá e esperar propagar de novo.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query['code'] as string | undefined;
  const stateRaw = req.query['state'] as string | undefined;
  const error = req.query['error'] as string | undefined;

  if (!stateRaw) return res.status(400).send('missing state');
  const { userId, platform } = decodeState(stateRaw);
  const backTo = platform === 'web' ? WEB_REDIRECT : NATIVE_REDIRECT;

  if (error || !code) {
    const msg = encodeURIComponent(error ?? 'missing_code');
    return res.redirect(302, `${backTo}?status=error&message=${msg}`);
  }

  try {
    const tokens = await exchangeGoogleCalendarCode(code, REDIRECT_URI);
    await supabaseAdmin().from('google_calendar_accounts').upsert(
      {
        user_id: userId,
        access_token: tokens.accessToken,
        // Google só devolve refresh_token na primeira autorização
        // (prompt=consent garante isso) — sem ele, mantém o antigo salvo.
        ...(tokens.refreshToken ? { refresh_token: tokens.refreshToken } : {}),
        token_type: tokens.tokenType,
        expires_at: tokens.expiresAt,
        scope: tokens.scope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    return res.redirect(302, `${backTo}?status=success`);
  } catch (err) {
    console.error('[calendar-callback] exchange error:', err);
    return res.redirect(302, `${backTo}?status=error&message=exchange_failed`);
  }
}
