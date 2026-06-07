module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Transform import.meta.env (used by zustand v5) for Metro/Hermes web compat
      function importMetaEnvTransform({ types: t }) {
        return {
          visitor: {
            MetaProperty(path) {
              if (
                path.node.meta.name === 'import' &&
                path.node.property.name === 'meta'
              ) {
                path.replaceWith(
                  t.objectExpression([
                    t.objectProperty(
                      t.identifier('env'),
                      t.objectExpression([
                        t.objectProperty(
                          t.identifier('MODE'),
                          t.memberExpression(
                            t.memberExpression(
                              t.identifier('process'),
                              t.identifier('env')
                            ),
                            t.identifier('NODE_ENV')
                          )
                        ),
                      ])
                    ),
                    t.objectProperty(
                      t.identifier('url'),
                      t.stringLiteral('')
                    ),
                  ])
                );
              }
            },
          },
        };
      },
      'react-native-reanimated/plugin',
    ],
  };
};
