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

      const WHISPER_IMPORT_LINE = 'import com.masya.argos.modules.WhisperCppSTT';
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
    implementation 'net.java.dev.jna:jna:5.17.0@aar'
    implementation 'com.microsoft.onnxruntime:onnxruntime-android:1.17.+'
    implementation 'org.tensorflow:tensorflow-lite:2.14.0'
    implementation 'com.google.android.gms:play-services-basement:18.0.0'
    implementation 'org.webrtc:google-webrtc:1.0.32006'
    expoModulesPlugins()
    `
    );
    return cfg;
  });
}

function withArgosVoiceCMakeConfig(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      return cfg;
    },
  ]);
}

function withArgosVoiceModelAsset(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
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
