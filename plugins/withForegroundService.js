/**
 * Config plugin para:
 * 1. Adicionar o ForegroundService ao AndroidManifest.xml
 * 2. Excluir com.android.support do build Gradle para evitar conflito com AndroidX
 */
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withManifestForegroundService(config) {
  return withAndroidManifest(config, cfg => {
    const manifest = cfg.modResults;
    if (!manifest?.manifest?.application) return cfg;

    const app = manifest.manifest.application[0];
    if (!app.service) app.service = [];

    // ATENÇÃO ao nome da classe: o pacote real é `com.asterinet.react.bgactions`
    // (ver node_modules/react-native-background-actions/android/src/main/java/...).
    // Havia um typo aqui — "reaction" em vez de "react" — que criava uma entrada
    // apontando para uma classe inexistente, enquanto o service DE VERDADE (vindo
    // do AndroidManifest da própria lib) continuava sem foregroundServiceType.
    // No Android 14+ chamar startForeground() com tipo microphone num service que
    // não declara o tipo no manifest lança MissingForegroundServiceTypeException,
    // então a escuta em background simplesmente não subia.
    const SERVICE_NAME = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

    const existing = app.service.find(s => s.$?.['android:name'] === SERVICE_NAME);

    if (existing) {
      existing.$['android:foregroundServiceType'] = 'microphone';
      existing.$['android:enabled'] = 'true';
      existing.$['android:exported'] = 'false';
    } else {
      app.service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'microphone',
        },
      });
    }

    // Remove a entrada errada, se sobrou de um build anterior.
    app.service = app.service.filter(
      s => s.$?.['android:name'] !== 'com.asterinet.reaction.bgactions.RNBackgroundActionsTask'
    );

    return cfg;
  });
}

function withGradleSupportExclusion(config) {
  return withDangerousMod(config, [
    'android',
    cfg => {
      const gradlePath = path.join(cfg.modRequest.projectRoot, 'android', 'build.gradle');
      if (!fs.existsSync(gradlePath)) return cfg;

      let content = fs.readFileSync(gradlePath, 'utf8');

      if (content.includes('exclude-com-android-support')) return cfg;

      // Adiciona ao final: exclui o grupo com.android.support de todos os subprojetos
      // para resolver o conflito de classe duplicada com AndroidX
      const exclusionBlock = `

// exclude-com-android-support
subprojects {
    configurations.all {
        exclude group: 'com.android.support'
    }
}
`;
      fs.writeFileSync(gradlePath, content + exclusionBlock);
      return cfg;
    },
  ]);
}

module.exports = config => {
  config = withManifestForegroundService(config);
  config = withGradleSupportExclusion(config);
  return config;
};
