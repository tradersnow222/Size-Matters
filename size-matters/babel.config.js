module.exports = function (api) {
  // Cache keyed on NODE_ENV so the production-only console stripping below is
  // re-evaluated correctly per environment.
  api.cache.using(() => process.env.NODE_ENV);

  const plugins = [
    [
      "module-resolver",
      {
        alias: {
          "@": "./src",
        },
      },
    ],
    "@babel/plugin-proposal-export-namespace-from",
  ];

  // Strip console.* from production bundles (keep error/warn for crash triage).
  // Dev keeps all logs. NODE_ENV is constant per-process, so caching is fine.
  if (process.env.NODE_ENV === "production" || process.env.BABEL_ENV === "production") {
    plugins.push(["transform-remove-console", { exclude: ["error", "warn"] }]);
  }

  // react-native-reanimated/plugin MUST be listed last.
  plugins.push("react-native-reanimated/plugin");

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind", unstable_transformImportMeta: true }],
      "nativewind/babel",
    ],
    plugins,
  };
};
