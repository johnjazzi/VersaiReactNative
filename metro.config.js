const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix for "Cannot read property 'S' of undefined" with whisper.rn
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'whisper.rn': require.resolve('whisper.rn'),
};

config.resolver.assetExts.push(
  'bin', // whisper.rn: ggml model binary
  'mil', // whisper.rn: CoreML model asset
  'gguf', // llama.rn: ggml model binary
  'mlmodelc',
  'm4a',
  'wav'
);

// Fix for module resolution
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs', 'mjs'];

module.exports = config;