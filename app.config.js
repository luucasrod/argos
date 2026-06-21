const appJson = require('./app.json');

module.exports = ({ config }) => {
  const base = { ...appJson.expo, ...config };

  return {
    ...base,
    extra: {
      ...base.extra,
      skipAuth: process.env.EXPO_PUBLIC_SKIP_AUTH === 'true',
    },
  };
};
