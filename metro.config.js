const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push(
  'bin', // whisper.rn: ggml model binary
  'mil', // whisper.rn: CoreML model asset
  'json', // xenova: model json
  'spm', // xenova: model spm
  'onnx', // xenova: model onnx
);

module.exports = config;