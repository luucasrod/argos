/**
 * Config plugin para o módulo nativo ArgosVoice (issue #215).
 *
 * android/ é gitignored e `expo prebuild` regenera a pasta do zero — este
 * plugin copia os arquivos-fonte de plugins/native/ pra dentro de android/ a
 * cada prebuild e registra o pacote em MainApplication.kt, seguindo
 * exatamente o padrão de withWizUdpModule.js.
 *
 * Diferença extra em relação ao WizUdp: este módulo chama a API do Vosk
 * (`org.vosk.Model`/`Recognizer`) diretamente, e essas classes só existem no
 * classpath de compilação de quem as declara como dependência. O
 * `react-native-vosk` (lib de terceiro, ainda usada só pelo plugin dela de
 * empacotamento do modelo) declara `com.alphacephei:vosk-android` e
 * `net.java.dev.jna:jna` como `implementation` — não exposto a outros
 * módulos Gradle. Por isso este plugin adiciona as MESMAS duas dependências
 * direto no `android/app/build.gradle`, senão o Kotlin não compila
 * (`Unresolved reference: vosk`).
 */
const { withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_PATH = 'com/masya/argos/modules';
const SOURCE_FILES = ['ArgosVoiceModule.kt', 'ArgosVoicePackage.kt'];

function withArgosVoiceSources(config) {
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

function withArgosVoiceRegistration(config) {
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

      const IMPORT_LINE = 'import com.masya.argos.modules.ArgosVoicePackage';
      if (!content.includes(IMPORT_LINE)) {
        content = content.replace(
          /^(package com\.masya\.argos\s*\n)/m,
          `$1\n${IMPORT_LINE}\n`
        );
      }

      const REGISTRATION_LINE = 'add(ArgosVoicePackage())';
      if (!content.includes(REGISTRATION_LINE)) {
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

/** Expõe org.vosk.Model/Recognizer (e a lib nativa JNA) pro módulo compilar. */
function withArgosVoiceGradleDeps(config) {
  return withAppBuildGradle(config, (cfg) => {
    const marker = 'com.alphacephei:vosk-android';
    if (cfg.modResults.contents.includes(marker)) return cfg;

    cfg.modResults.contents = cfg.modResults.contents.replace(
      /dependencies\s*\{/,
      `dependencies {
    // ArgosVoice (issue #215) chama org.vosk.Model/Recognizer diretamente —
    // react-native-vosk declara isto como "implementation", não exposto a
    // outros módulos Gradle, por isso repetido aqui.
    implementation 'com.alphacephei:vosk-android:0.3.70@aar'
    implementation 'net.java.dev.jna:jna:5.17.0@aar'`
    );
    return cfg;
  });
}

module.exports = (config) => {
  config = withArgosVoiceSources(config);
  config = withArgosVoiceRegistration(config);
  config = withArgosVoiceGradleDeps(config);
  return config;
};
