import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="format-detection" content="telephone=no" />

        {/* ─── PWA ─── */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7C3AED" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* ─── iOS Safari PWA ─── */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Argos" />
        <link rel="apple-touch-icon" href="/assets/icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/assets/icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/assets/icon.png" />

        {/* ─── Favicon ─── */}
        <link rel="icon" type="image/png" href="/assets/favicon.png" />

        {/* ─── App meta ─── */}
        <title>Argos</title>
        <meta name="description" content="Seu assistente de IA pessoal" />
        <meta name="application-name" content="Argos" />

        <ScrollViewStyleReset />

        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                height: 100%;
                width: 100%;
                max-width: 100%;
                margin: 0;
                padding: 0;
                background-color: #050810 !important;
                overscroll-behavior: none;
                overflow-x: hidden;
                -webkit-text-size-adjust: 100%;
                touch-action: manipulation;
              }
              body { overflow: hidden; }
              #root {
                display: flex;
                flex: 1;
                min-height: 100%;
                width: 100%;
                max-width: 100%;
                overflow-x: hidden;
                background-color: #050810 !important;
              }
              input, textarea, select {
                font-size: 16px !important;
              }
            `,
          }}
        />
      </head>
      <body style={{ backgroundColor: '#050810' }}>
        {children}

        {/* ─── Registro do Service Worker ─── */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then(function(reg) {
                      console.log('[Argos SW] Registrado:', reg.scope);
                    })
                    .catch(function(err) {
                      console.warn('[Argos SW] Falha ao registrar:', err);
                    });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
