# Versai Translate

![Versai Translate Logo](https://raw.githubusercontent.com/johnjazzi/VersaiReactNative/5b5dfe5cab7d1a6b73fd1d955cdc8ac3441ef6d4/assets/icon.png)

## Offline Translation for Everyone

VersAI Translate is an open-source, privacy-focused alternative to Google Translate that works entirely offline with no conversation logs being sent to anyone. Built with React Native and powered by open-source machine learning models, it allows you to translate text and speech without an internet connection.

## Features

- **100% Offline Translation**: Works without an internet connection
- **Cross-Platform**: Available for iOS and Android (via React Native)
- **Voice Translation**: Speak in one language, get translation in another
- **Real-Time Conversation**: Switch between languages seamlessly during conversations
- **Privacy-Focused**: All processing happens on your device, no data leaves your phone
- **Open Source**: Completely transparent and community-driven

## Technology

Versai leverages powerful open-source machine learning models:

- **Whisper.cpp**: For speech recognition (transcription)
- **Llama.cpp**: For text translation with Llama-3.2-1B-Instruct model
- **iOS Translate Tasks**: For native iOS translation capabilities

## Getting Started

### Prerequisites

- Node.js (16.x or newer)
- Yarn
- Expo CLI
- iOS or Android development environment

### Installation

```bash
# Clone the repository
git clone https://github.com/username/VersaiReactNative.git
cd VersaiReactNative

# Install dependencies
yarn install

### Running on Device (Dev Mode)

```bash
yarn prebuild --clean
yarn pod-install
yarn ios --device
```

### Running on Device (Release Mode)

```bash
yarn prebuild --clean
npx expo run:ios --device --configuration Release
```

You may need to run in tunnel mode:
```bash
yarn start --tunnel
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for the speech recognition model
- [llama.cpp](https://github.com/ggerganov/llama.cpp) for the translation model
- The entire open-source community for making offline ML models accessible to everyone
