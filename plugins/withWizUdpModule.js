/**
 * Config plugin para o módulo nativo WizUdpModule (issue #11).
 *
 * android/ é gitignored e `expo prebuild` regenera a pasta do zero — o
 * módulo Kotlin já foi perdido assim uma vez (ver docs/ai/CONTEXT.md). Este
 * plugin copia os arquivos-fonte de plugins/native/ para dentro de android/
 * a cada prebuild e registra o pacote em MainApplication.kt, para o módulo
 * sobreviver.
 *
 * services/devices/wizLocalDirect.native.ts já lê `NativeModules.WizUdp`
 * (bridge legado) — por isso o módulo é escrito como ReactPackage/
 * ReactContextBaseJavaModule "estilo antigo", não TurboModule com codegen: a
 * Nova Arquitetura continua servindo módulos assim via interop, sem exigir
 * mudar o lado JS.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_PATH = 'com/masya/argos/modules';
const SOURCE_FILES = ['WizUdpModule.kt', 'WizUdpPackage.kt'];

function withWizUdpSources(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const targetDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        PACKAGE_PATH
      );
      fs.mkdirSync(targetDir, { recursive: true });

      for (const file of SOURCE_FILES) {
        const from = path.join(__dirname, 'native', file);
        const to = path.join(targetDir, file);
        fs.copyFileSync(from, to);
      }

      return cfg;
    },
  ]);
}

function withWizUdpRegistration(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const mainAppPath = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'masya',
        'argos',
        'MainApplication.kt'
      );
      if (!fs.existsSync(mainAppPath)) return cfg;

      let content = fs.readFileSync(mainAppPath, 'utf8');

      const IMPORT_LINE = 'import com.masya.argos.modules.WizUdpPackage';
      if (!content.includes(IMPORT_LINE)) {
        // Logo depois do pacote da classe, antes dos outros imports.
        content = content.replace(
          /^(package com\.masya\.argos\s*\n)/m,
          `$1\n${IMPORT_LINE}\n`
        );
      }

      const REGISTRATION_LINE = 'add(WizUdpPackage())';
      if (!content.includes(REGISTRATION_LINE)) {
        // O placeholder gerado pelo Expo já vem como comentário nesse ponto —
        // ver MainApplication.kt gerado: "add(MyReactNativePackage())".
        content = content.replace(
          /(PackageList\(this\)\.packages\.apply\s*\{)/,
          `$1\n              ${REGISTRATION_LINE}`
        );
      }

      fs.writeFileSync(mainAppPath, content);
      return cfg;
    },
  ]);
}

module.exports = (config) => {
  config = withWizUdpSources(config);
  config = withWizUdpRegistration(config);
  return config;
};
