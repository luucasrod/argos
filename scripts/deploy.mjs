/**
 * deploy.mjs — deploya pro Vercel e garante que argos-blue.vercel.app aponta para o novo deploy.
 * Uso: npm run deploy
 */
import { execSync } from 'child_process';

const ALIAS = 'argos-blue.vercel.app';

console.log('🚀 Deployando para produção...\n');

let output;
try {
  output = execSync('npx vercel deploy --prod 2>&1', { encoding: 'utf-8' });
} catch (err) {
  output = err.stdout ?? '';
  if (!output.includes('Production')) {
    console.error('❌ Deploy falhou.\n', err.stderr ?? err.message);
    process.exit(1);
  }
}

console.log(output);

// Extrai a URL de produção gerada pelo deploy
const match = output.match(/Production\s+(https:\/\/\S+)/);
if (!match) {
  console.error('❌ Não foi possível extrair a URL de produção do output do deploy.');
  process.exit(1);
}

const deployUrl = match[1].replace(/\s.*/, '');
console.log(`\n📎 Atualizando alias ${ALIAS} → ${deployUrl}...`);

try {
  execSync(`npx vercel alias set ${deployUrl} ${ALIAS}`, { stdio: 'inherit' });
  console.log(`✅ ${ALIAS} atualizado com sucesso!`);
} catch (err) {
  console.error('❌ Falha ao atualizar alias:', err.message);
  process.exit(1);
}
