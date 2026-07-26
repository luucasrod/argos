/**
 * inject-pwa.mjs
 * Pós-build: injeta manifest link, SW registration e meta tags PWA no dist/index.html
 * Executar após: npx expo export --platform web
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const HTML_FILE = resolve(__dir, '../dist/index.html');

let html = readFileSync(HTML_FILE, 'utf-8');

/* ─── Tags para injetar no <head> ─── */
const headTags = `
  <!-- PWA Manifest -->
  <link rel="manifest" href="/manifest.json" />
  <!-- PWA meta tags -->
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Argos" />
  <meta name="description" content="Seu assistente de IA pessoal" />
  <meta name="application-name" content="Argos" />
  <!-- iOS icons -->
  <link rel="apple-touch-icon" href="/assets/icon.png" />
  <link rel="apple-touch-icon" sizes="152x152" href="/assets/icon.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/icon.png" />
`;

/* ─── Script de registro do Service Worker ───
 * No iOS, "fechar" o PWA pela tela de início normalmente só suspende o
 * processo — reabrir não garante um recarregamento de verdade, então o app
 * pode continuar rodando o JS antigo por dias mesmo com deploys novos no ar.
 * Pra compensar: sempre que o app volta ao primeiro plano, força uma checagem
 * de atualização do Service Worker, e recarrega sozinho assim que uma versão
 * nova assume o controle da página.
 */
const swScript = `
<script>
  if ('serviceWorker' in navigator) {
    var swReg = null;
    var reloadedForUpdate = false;

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      window.location.reload();
    });

    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(function (reg) {
          console.log('[Argos SW] Registrado:', reg.scope);
          swReg = reg;
        })
        .catch(function (err) {
          console.warn('[Argos SW] Falha ao registrar:', err);
        });
    });

    // iOS suspende o PWA em vez de fechar de verdade — checa por update toda
    // vez que a aba/app volta a ficar visível (reabrir do ícone dispara isso).
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && swReg) {
        swReg.update().catch(function () {});
      }
    });
  }
</script>
`;

// 1. Corrige lang="en" → lang="pt-BR"
html = html.replace(/(<html\s[^>]*lang=")[^"]*(")/i, '$1pt-BR$2');

// 2. Corrige theme-color para roxo Argos
html = html.replace(
  /<meta\s+name="theme-color"\s+content="[^"]*"\s*\/?>/i,
  '<meta name="theme-color" content="#7C3AED" />'
);

// 2b. Viewport fixo — evita zoom e barras laterais no mobile/PWA
html = html.replace(
  /<meta\s+name="viewport"\s+content="[^"]*"\s*\/?>/i,
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover" />'
);

// 3. Injeta tags PWA antes de </head>
html = html.replace('</head>', headTags + '\n  </head>');

// 4. Injeta script SW antes de </body>
html = html.replace('</body>', swScript + '\n</body>');

writeFileSync(HTML_FILE, html, 'utf-8');

console.log('✅ [PWA] dist/index.html atualizado com:');
console.log('   • <link rel="manifest" href="/manifest.json">');
console.log('   • Service Worker registration script');
console.log('   • Apple PWA meta tags');
console.log('   • lang="pt-BR"');
console.log('   • theme-color="#7C3AED"');
