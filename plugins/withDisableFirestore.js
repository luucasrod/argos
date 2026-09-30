const { withAppBuildGradle, withProjectBuildGradle } = require("@expo/config-plugins");

module.exports = function withDisableFirestore(config) {
  config = withProjectBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    gradle = gradle.replace(/\s*classpath\s+['"](.*?)com\.google\.gms:google-services(.*?)['"]/g, "");
    config.modResults.contents = gradle;
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    gradle = gradle
      .replace(/apply\s+plugin:\s['"]com\.google\.gms\.google-services['"]/g, "")
      .replace(/\s*implementation\s+['"](.*?)com\.google\.firebase(.*?)['"]/g, "");
    config.modResults.contents = gradle;
    return config;
  });

  return config;
};
