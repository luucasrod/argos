/**
 * api/chrome.ts — Rotas para integração com Google Home/Smart Home API.
 * Endpoints: login, callback, devices, control, disconnect
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  buildAuthorizeUrl,
  controlChromeDevice,
  disconnectChrome,
  exchangeCodeForTokens,
  getUserFromAuthHeader,
  listChromeDevices,
  refreshAccessToken,
  supabaseAdmin,
} from './_lib/chrome';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const authHeader = request.headers.get('Authorization');

  try {
    // ─── LOGIN ───
    if (action === 'login') {
      const user = await getUserFromAuthHeader(authHeader);
      if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

      const state = user.userId;
      const authorizeUrl = buildAuthorizeUrl(state);

      return NextResponse.json({ authUrl: authorizeUrl });
    }

    // ─── CALLBACK (OAuth redirect) ───
    if (action === 'callback') {
      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code || !state) {
        return NextResponse.json({ error: 'Code ou state ausente' }, { status: 400 });
      }

      const tokens = await exchangeCodeForTokens(code);

      // Salva tokens no Supabase
      const { error } = await supabaseAdmin.from('integrations').upsert(
        {
          user_id: state,
          provider: 'chrome',
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );

      if (error) {
        return NextResponse.json(
          { error: `Falha ao salvar tokens: ${error.message}` },
          { status: 500 }
        );
      }

      // Redireciona para o app
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/settings?chrome=success`);
    }

    // ─── DEVICES ───
    if (action === 'devices') {
      const user = await getUserFromAuthHeader(authHeader);
      if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

      const { data: integration, error: fetchError } = await supabaseAdmin
        .from('integrations')
        .select('access_token,refresh_token,expires_at')
        .eq('user_id', user.userId)
        .eq('provider', 'chrome')
        .single();

      if (fetchError || !integration) {
        return NextResponse.json({ connected: false, devices: [] });
      }

      let accessToken = integration.access_token;
      const expiresAt = new Date(integration.expires_at).getTime();

      // Se token expirou, renova
      if (expiresAt < Date.now()) {
        try {
          const renewed = await refreshAccessToken(integration.refresh_token);
          accessToken = renewed.accessToken;

          await supabaseAdmin
            .from('integrations')
            .update({
              access_token: renewed.accessToken,
              expires_at: new Date(Date.now() + renewed.expiresIn * 1000).toISOString(),
            })
            .eq('user_id', user.userId)
            .eq('provider', 'chrome');
        } catch (_err) {
          return NextResponse.json({ connected: false, devices: [] });
        }
      }

      try {
        const devices = await listChromeDevices(accessToken);
        return NextResponse.json({ connected: true, devices });
      } catch (_err) {
        return NextResponse.json({ connected: false, devices: [] });
      }
    }

    return NextResponse.json({ error: 'Action não suportada' }, { status: 400 });
  } catch (err) {
    console.error('[chrome] erro:', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const authHeader = request.headers.get('Authorization');

  try {
    const user = await getUserFromAuthHeader(authHeader);
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    // ─── CONTROL ───
    if (action === 'control') {
      const body = (await request.json()) as {
        deviceId: string;
        command: string;
        params?: Record<string, unknown>;
      };

      const { data: integration, error: fetchError } = await supabaseAdmin
        .from('integrations')
        .select('access_token,refresh_token,expires_at')
        .eq('user_id', user.userId)
        .eq('provider', 'chrome')
        .single();

      if (fetchError || !integration) {
        return NextResponse.json({ error: 'Google Home não conectado' }, { status: 401 });
      }

      let accessToken = integration.access_token;
      const expiresAt = new Date(integration.expires_at).getTime();

      if (expiresAt < Date.now()) {
        try {
          const renewed = await refreshAccessToken(integration.refresh_token);
          accessToken = renewed.accessToken;

          await supabaseAdmin
            .from('integrations')
            .update({
              access_token: renewed.accessToken,
              expires_at: new Date(Date.now() + renewed.expiresIn * 1000).toISOString(),
            })
            .eq('user_id', user.userId)
            .eq('provider', 'chrome');
        } catch (_err) {
          return NextResponse.json({ error: 'Falha ao renovar token Google' }, { status: 401 });
        }
      }

      await controlChromeDevice(accessToken, body);
      return NextResponse.json({ success: true });
    }

    // ─── DISCONNECT ───
    if (action === 'disconnect') {
      await disconnectChrome(user.userId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Action não suportada' }, { status: 400 });
  } catch (err) {
    console.error('[chrome POST] erro:', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
