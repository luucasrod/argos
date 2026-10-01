/**
 * api/chat-with-jarvis.ts — Chat Wrapper com Jarvis Interceptor
 * Se detecta "jarvis" na mensagem, manda pra jarvis-bridge direto.
 * Senão, passa pro chat normal.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { spawn } from 'child_process';
import path from 'path';
import anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

const JARVIS_KEYWORDS = ['jarvis', 'jarvis,', 'jarvis:', 'hey jarvis', 'ó jarvis'];

interface ChatRequest {
  model: string;
  system: string;
  messages: MessageParam[];
  max_tokens?: number;
  stream?: boolean;
}

interface JarvisResponse {
  is_jarvis_command: boolean;
  project?: string;
  action?: string;
  dispatch_status: string;
}

function hasJarvisKeyword(messages: MessageParam[]): boolean {
  """
  Verifica se qualquer mensagem contém "jarvis"
  """
  return messages.some((msg) => {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      return JARVIS_KEYWORDS.some((kw) => msg.content.toLowerCase().includes(kw));
    }
    return false;
  });
}

function extractUserMessage(messages: MessageParam[]): string {
  """
  Extrai a última mensagem do usuário
  """
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && typeof messages[i].content === 'string') {
      return messages[i].content as string;
    }
  }
  return '';
}

async function callJarvisBridge(message: string): Promise<JarvisResponse> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(
      'C:\\Users\\syann\\Desktop\\Jarvis-AI-For-Windows-2026',
      'jarvis_argos_bridge.py'
    );

    const python = spawn('python', [pythonScript, '--message', message]);
    let output = '';

    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('Bridge failed'));
        return;
      }

      try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          resolve(JSON.parse(jsonMatch[0]) as JarvisResponse);
        } else {
          reject(new Error('No JSON from bridge'));
        }
      } catch (e) {
        reject(new Error('Parse error'));
      }
    });
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const chatReq = req.body as ChatRequest;
  const { model, system, messages, max_tokens, stream } = chatReq;

  // PASO 1: Verifica se tem "jarvis" na mensagem
  if (hasJarvisKeyword(messages)) {
    console.log('[ARGOS] Detectou Jarvis - enviando ao bridge...');

    try {
      const userMsg = extractUserMessage(messages);
      const jarvisResult = await callJarvisBridge(userMsg);

      // Responde ao cliente que foi pro Jarvis
      return res.status(200).json({
        type: 'jarvis_dispatch',
        original_message: userMsg,
        jarvis_analysis: jarvisResult,
        message: `Detectei Jarvis. Analisando: ${jarvisResult.project} - ${jarvisResult.action}`,
      });
    } catch (error) {
      console.error('[ARGOS] Jarvis bridge error:', error);
      // Se falhar, cai pro chat normal
      console.log('[ARGOS] Fallback to normal chat...');
    }
  }

  // PASSO 2: Chat normal (sem "jarvis" ou se bridge falhar)
  console.log('[ARGOS] Chat normal (sem Jarvis)');

  // Aqui entra o chat normal do Argos (pode chamar a lógica do chat.ts)
  // Por enquanto, retorna placeholder
  return res.status(200).json({
    type: 'chat',
    message: 'Chat normal (sem Jarvis)',
  });
}
