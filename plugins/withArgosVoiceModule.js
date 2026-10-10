const { withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_PATH = 'com/masya/argos/modules';
const SOURCE_FILES = ['ArgosVoiceModule.kt', 'ArgosVoicePackage.kt', 'WhisperCppModule.kt', 'WhisperCppSTTPackage.kt', 'AudioProcessingModule.kt', 'AudioProcessingPackage.kt'];

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
        if (fs.existsSync(from)) {
          fs.copyFileSync(from, to);
        }
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

      const AUDIO_PROCESSING_REGISTRATION_LINE = 'add(AudioProcessingPackage())';
      if (!content.includes(AUDIO_PROCESSING_REGISTRATION_LINE)) {
        content = content.replace(
          /(PackageList\(this\)\.packages\.apply\s*\{)/,
          `$1\n              ${AUDIO_PROCESSING_REGISTRATION_LINE}`
        );
      }

      const WHISPER_IMPORT_LINE = 'import com.masya.argos.modules.WhisperCppSTTPackage';
      if (!content.includes(WHISPER_IMPORT_LINE)) {
        content = content.replace(
          /^(package com\.masya\.argos\s*\n)/m,
          `$1\n${WHISPER_IMPORT_LINE}\n`
        );
      }

      const AUDIO_PROCESSING_IMPORT_LINE = 'import com.masya.argos.modules.AudioProcessingPackage';
      if (!content.includes(AUDIO_PROCESSING_IMPORT_LINE)) {
        content = content.replace(
          /^(package com\.masya\.argos\s*\n)/m,
          `$1\n${AUDIO_PROCESSING_IMPORT_LINE}\n`
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

function withArgosVoiceGradleDeps(config) {
  return withAppBuildGradle(config, (cfg) => {
    const marker = 'com.alphacephei:vosk-android';
    if (cfg.modResults.contents.includes(marker)) return cfg;

    cfg.modResults.contents = cfg.modResults.contents.replace(
      /dependencies\s*\{/,
      `dependencies {
    implementation 'com.alphacephei:vosk-android:0.3.70@aar'
    implementation 'com.microsoft.onnxruntime:onnxruntime-android:1.17.+'
    implementation 'org.tensorflow:tensorflow-lite:2.14.0'
    implementation 'com.google.android.gms:play-services-basement:18.0.0'
    `
    );
    return cfg;
  });
}

/**
 * Copia CMakeLists.txt e jni/WhisperJni.cpp para android/app/,
 * e adiciona externalNativeBuild + abiFilters no build.gradle do app.
 *
 * O CMake baixa whisper.cpp via FetchContent no primeiro build.
 * Para o modelo GGML, veja withArgosVoiceModelAsset abaixo.
 */
function withArgosVoiceCMakeConfig(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const appDir = cfg.modRequest.platformProjectRoot;

      // Copiar CMakeLists.txt para android/app/
      const cmakeSrc = path.join(__dirname, 'native', 'CMakeLists.txt');
      const cmakeDest = path.join(appDir, 'app', 'CMakeLists.txt');
      if (fs.existsSync(cmakeSrc)) {
        fs.copyFileSync(cmakeSrc, cmakeDest);
      }

      // Copiar jni/ para android/app/src/main/jni/
      const jniSrcDir = path.join(__dirname, 'native', 'jni');
      const jniDestDir = path.join(appDir, 'app', 'src', 'main', 'jni');
      if (fs.existsSync(jniSrcDir)) {
        fs.mkdirSync(jniDestDir, { recursive: true });
        for (const file of fs.readdirSync(jniSrcDir)) {
          fs.copyFileSync(
            path.join(jniSrcDir, file),
            path.join(jniDestDir, file)
          );
        }
      }

      // Adicionar externalNativeBuild e abiFilters ao app/build.gradle
      const gradlePath = path.join(appDir, 'app', 'build.gradle');
      if (fs.existsSync(gradlePath)) {
        let gradle = fs.readFileSync(gradlePath, 'utf8');

        // externalNativeBuild dentro de android {}
        const cmakeMarker = 'externalNativeBuild {';
        if (!gradle.includes(cmakeMarker)) {
          gradle = gradle.replace(
            /android\s*\{/,
            `android {
    externalNativeBuild {
        cmake {
            path "CMakeLists.txt"
            version "3.22.1+"
        }
    }`
          );
        }

        // abiFilters dentro de defaultConfig {}
        const abiMarker = 'abiFilters';
        if (!gradle.includes(abiMarker)) {
          gradle = gradle.replace(
            /defaultConfig\s*\{/,
            `defaultConfig {
        externalNativeBuild {
            cmake {
                abiFilters "arm64-v8a", "x86_64"
                arguments "-DANDROID_STL=c++_shared"
            }
        }`
          );
        }

        fs.writeFileSync(gradlePath, gradle);
      }

      return cfg;
    },
  ]);
}

/**
 * Instrução sobre o modelo GGML (não baixa automaticamente — o arquivo
 * é grande demais para empacotamento automático sem escolha do usuário).
 *
 * Para preparar o modelo:
 *   1. Baixe de https://huggingface.co/ggerganov/whisper.cpp/tree/main
 *      o arquivo ggml-tiny-q5_1.bin (~31 MB) ou ggml-base-q5_1.bin (~57 MB)
 *   2. Renomeie para ggml-model.bin
 *   3. Coloque em: assets/whisper-pt/ggml-model.bin
 *
 * O módulo copia o arquivo para getFilesDir() no primeiro loadModel().
 * Sem o modelo, loadModel() falha com MODEL_LOAD_ERROR (fallback cloud).
 */
function withArgosVoiceModelAsset(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      // Verifica se o modelo foi adicionado pelo desenvolvedor
      const modelSrc = path.join(
        cfg.modRequest.projectRoot,
        'assets',
        'whisper-pt',
        'ggml-model.bin'
      );
      if (!fs.existsSync(modelSrc)) {
        console.warn(
          '[withArgosVoiceModule] Modelo GGML não encontrado em assets/whisper-pt/ggml-model.bin.\n' +
          '  Baixe ggml-tiny-q5_1.bin ou ggml-base-q5_1.bin de:\n' +
          '  https://huggingface.co/ggerganov/whisper.cpp/tree/main\n' +
          '  e renomeie para ggml-model.bin nesse diretório.'
        );
      }
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
