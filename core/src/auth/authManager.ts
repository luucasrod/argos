/**
 * Gerencia o token de autenticação do Argos Core.
 * Gera um token aleatório na primeira execução e persiste em disco.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const TOKEN_FILE = path.join(process.env.APPDATA ?? process.env.HOME ?? '.', 'argos-core', 'token.txt');

export class AuthManager {
  private token: string;

  constructor() {
    this.token = this.loadOrCreate();
  }

  private loadOrCreate(): string {
    try {
      fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
      if (fs.existsSync(TOKEN_FILE)) {
        return fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
      }
    } catch {}
    const token = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(TOKEN_FILE, token, 'utf-8');
    } catch {}
    return token;
  }

  getToken(): string {
    return this.token;
  }

  verify(token: string | null): boolean {
    if (!token) return false;
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(this.token));
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const auth = req.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (!this.verify(token)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      next();
    };
  }
}
