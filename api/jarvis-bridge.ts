/**
 * api/jarvis-bridge.ts — Argos → Jarvis Integration
 * Quando Argos detecta comando com "Jarvis", chama esse endpoint.
 * Jarvis analisa, identifica projeto, despacha pra Claude Code autonomamente.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { spawn } from 'child_process';
import path from 'path';

interface JarvisRequest {
  message: string;
  user_id?: string;
  session_id?: string;
}

interface JarvisResponse {
  is_jarvis_command: boolean;
  project?: string;
  action?: string;
  task_description: string;
  dispatch_status: string;
  timestamp: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body as JarvisRequest;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message required' });
  }

  try {
    // Chama o Python bridge do Jarvis
    const jarvisResponse = await callJarvisBridge(message);
    return res.status(200).json(jarvisResponse);
  } catch (error) {
    const err = error as Error;
    console.error('Jarvis bridge error:', err.message);
    return res.status(500).json({
      error: 'Jarvis bridge failed',
      message: err.message,
    });
  }
}

/**
 * Chama o Python bridge do Jarvis (jarvis_argos_bridge.py)
 */
function callJarvisBridge(message: string): Promise<JarvisResponse> {
  return new Promise((resolve, reject) => {
    // Caminho para o script Python do Jarvis
    const pythonScript = path.join(
      'C:\\Users\\syann\\Desktop\\Jarvis-AI-For-Windows-2026',
      'jarvis_argos_bridge.py'
    );

    // Spawn processo Python
    const python = spawn('python', [pythonScript, '--message', message]);

    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed: ${errorOutput}`));
        return;
      }

      try {
        // Parse JSON output from Python script
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          resolve(result as JarvisResponse);
        } else {
          reject(new Error('No JSON output from Jarvis bridge'));
        }
      } catch (e) {
        reject(new Error(`Failed to parse Jarvis response: ${output}`));
      }
    });
  });
}
