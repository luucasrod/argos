/**
 * api/chat.ts — Vercel Serverless Function
 * Valida o token Supabase + repassa para a Anthropic API.
 * A chave Anthropic fica SOMENTE no servidor.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'https://qzoknfwfvdqcnbsirwlf.supabase.co',
  process.env.SUPABASE_ANON_KEY ?? ''
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Valida se o usuário está autenticado via Supabase
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Token de autenticação ausente' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Sessão inválida ou expirada' });
  }

  // Verifica chave Anthropic
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'server_error', message: 'API key não configurada no servidor' });
  }

  try {
    const { model, system, messages, max_tokens } = req.body;

    if (!model || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'invalid_request', message: 'Parâmetros inválidos' });
    }

    const response = await anthropic.messages.create({
      model,
      system,
      messages,
      max_tokens: max_tokens ?? 1024,
    });

    return res.status(200).json(response);
  } catch (err) {
    const apiErr = err as { status?: number; error?: { type?: string; message?: string }; message?: string };

    if (apiErr.status === 401) {
      return res.status(401).json({ error: 'authentication_error', message: 'Chave Anthropic inválida no servidor' });
    }

    return res.status(apiErr.status ?? 500).json({
      error: apiErr.error?.type ?? 'api_error',
      message: apiErr.error?.message ?? apiErr.message ?? 'Erro desconhecido',
    });
  }
}
