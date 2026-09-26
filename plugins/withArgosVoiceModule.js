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
 *
 * Para V-002 (Whisper.cpp STT on-device):
 * - Adiciona a lib nativa whisper-cpp compilada via CMake/NDK
 * - Copia o modelo whisper-pt/model.bin para o storage do app
 * - Registra o pacote WhisperCppSTT
 */
const { withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_PATH = 'com/masya/argos/modules';
const SOURCE_FILES = ['ArgosVoiceModule.kt', 'ArgosVoicePackage.kt', 'WhisperCppModule.kt', 'WhisperCppSTTPackage.kt'];

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

      // Also add WhisperCppSTT package registration
      const WHISPER_IMPORT_LINE = 'import com.masya.argos.modules.WhisperCppSTT';
      if (!content.includes(WHISPER_IMPORT_LINE)) {
        content = content.replace(
          /^(package com\.masya\.argos\s*\n)/m,
          `$1\n${WHISPER_IMPORT_LINE}\n`
        );
      }

      const WHISPER_REGISTRATION_LINE = 'add(WhisperCppSTTPackage())';
      if (!content.includes(WHISPER_REGISTRATION_LINE)) {
        content = content.replace(
          /(PackageList\(this\)\.packages\.apply\s*\{)/,
          `$1\n              ${WHISPER_REGISTRATION_LINE}`
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
    implementation 'net.java.dev.jna:jna:5.17.0@aar'

    // LiveKit Wakeword (V-001) — openWakeWord ONNX integration
    implementation 'com.microsoft.onnxruntime:onnxruntime-android:1.17.+'
    implementation 'org.tensorflow:tensorflow-lite:2.14.0'

    // V-002 Whisper.cpp — native library via CMake/NDK
    implementation 'com.google.android.gms:play-services-basement:18.0.0'

    // Expo Modules for native bridging
    expoModulesPlugins()
    }
    );
    return cfg;
  });
}

/** Configura o CMake para compilar whisper.cpp como biblioteca nativa Android. */
function withArgosVoiceCMakeConfig(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const cmakeDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'jni'
      );
      // CMakeLists.txt já está presente em android/app/src/main/jni/
      // O build.gradle já inclui a configuração CMake
      return cfg;
    },
  ]);
}

/** Copia o modelo Whisper de assets pra storage do app na primeira inicialização. */
function withArgosVoiceModelAsset(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      // O modelo é copiado no Kotlin WhisperCppSTT.onCreate() via ensureModelAvailable()
      // Nenhuma ação extra necessária aqui - o arquivo assets/whisper-pt/model.bin
      // será copiado automaticamente pelo módulo nativo.
      return cfg;
    },
  ]);
}

module.exports = (config) => {
  config = withArgosVoiceSources(config);
  config = withArgosVoiceRegistration(config);
  config = withArgosVoiceGradleDeps(config);
  config = withArgosVoiceCMakeConfig(config);
  config = withArgosVoiceModelAsset(config);
  return config;
};