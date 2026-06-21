// app.config.js — lê a chave Anthropic do .env em tempo de build
// e a injeta em Constants.expoConfig.extra para uso seguro no runtime.
const appJson = require('./app.json');

module.exports = ({ config }) => {
  const base = { ...appJson.expo, ...config };

  return {
    ...base,
    extra: {
      ...base.extra,
      anthropicApiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '',
      skipAuth: process.env.EXPO_PUBLIC_SKIP_AUTH === 'true',
    },
  };
};
