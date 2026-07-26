const appJson = require('./app.json');

module.exports = ({ config }) => {
  const base = { ...appJson.expo, ...config };

  const now = new Date();
  const buildTime = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`;

  return {
    ...base,
    extra: {
      ...base.extra,
      skipAuth: process.env.EXPO_PUBLIC_SKIP_AUTH === 'true',
      buildTime,
    },
  };
};
