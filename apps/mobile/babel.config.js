/**
 * Babel config for the Expo app. `babel-preset-expo` covers RN + Expo Router.
 * The worklets plugin (Reanimated 4) MUST be listed last.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"],
  };
};
