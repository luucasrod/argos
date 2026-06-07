// app.config.js — lê a chave Anthropic do .env em tempo de build
// e a injeta em Constants.expoConfig.extra para uso seguro no runtime.
const appJson = require('./app.json');

module.exports = ({ config }) => {
  const base = { ...appJson.expo, ...config };

  return {
    ...base,
    extra: {
      ...base.extra,
      // Lido do .env pelo Expo CLI antes de bundlar — nunca vazio se .env estiver correto
      anthropicApiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '',
    },
  };
};
