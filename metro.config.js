const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push(
  'bin', // whisper.rn: ggml model binary
  'mil', // whisper.rn: CoreML model asset
  'gguf', // llama.rn: ggml model binary`
  'mlmodelc',
);

module.exports = config;