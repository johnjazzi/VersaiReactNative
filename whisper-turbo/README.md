# whisper-turbo

A high-performance React Native implementation of OpenAI's Whisper model for real-time speech recognition, based directly on [whisper.cpp](https://github.com/ggml-org/whisper.cpp).

## Features

- Direct implementation of whisper.cpp with minimal overhead
- Real-time transcription using audio streaming
- Voice activity detection to only process speech
- Support for iOS and Android
- Highly optimized native code for maximum performance
- Clean React Native API with TypeScript definitions

## Installation

```sh
npm install whisper-turbo
# or
yarn add whisper-turbo
```

### iOS

```sh
cd ios && pod install && cd ..
```

### Android

No additional steps required for Android setup.

## Preparing the Model File

You'll need to download a Whisper model file and make it available to your app:

1. Download a ggml-based Whisper model from [ggerganov/whisper.cpp](https://github.com/ggml-org/whisper.cpp)
   * Recommended starting point: `ggml-tiny.en.bin` for English-only or `ggml-tiny.bin` for multilingual
   * Quantized models like `ggml-tiny.en-q4_0.bin` offer even better performance

2. Make the model file available to your app:
   * For development: Place it in your app's document directory
   * For production: Bundle it with your app or download it on first run

## Usage

```javascript
import { initWhisper, AudioCategory, AudioCategoryOption, AudioMode, AudioSession } from 'whisper-turbo';

// Initialize the model
const whisperContext = await initWhisper('/path/to/your/model.bin');

// Set up audio session (iOS only)
if (Platform.OS === 'ios') {
  await AudioSession.setCategory(
    AudioCategory.PlayAndRecord,
    [AudioCategoryOption.AllowBluetooth, AudioCategoryOption.DefaultToSpeaker]
  );
  await AudioSession.setMode(AudioMode.SpokenAudio);
  await AudioSession.setActive(true);
}

// Subscribe to transcription results
const unsubscribe = whisperContext.subscribe((result) => {
  console.log('Transcription:', result.text);
  console.log('Progress:', result.progress);
});

// Start streaming
await whisperContext.startStreaming({
  language: 'en', // Optional: specify language
});

// Later, stop streaming
await whisperContext.stopStreaming();

// Release resources when done
await whisperContext.release();
```

## API Reference

### initWhisper(modelPath)

Initializes a new WhisperContext with the specified model file.

- **modelPath** (string): Path to the whisper model file
- **Returns**: Promise\<WhisperContext\>

### WhisperContext

#### startStreaming(options)

Starts capturing audio and streaming transcription results.

- **options** (object): Optional configuration
  - **language** (string): Language code (default: auto-detect)
- **Returns**: Promise\<boolean\>

#### stopStreaming()

Stops audio capture and transcription.

- **Returns**: Promise\<boolean\>

#### subscribe(callback)

Subscribes to transcription results.

- **callback** (function): Called with transcription updates
- **Returns**: Function to unsubscribe

#### release()

Releases all resources associated with this context.

- **Returns**: Promise\<boolean\>

### AudioSession (iOS only)

#### setCategory(category, options)

Sets the audio session category.

- **category** (AudioCategory): The category to set
- **options** (AudioCategoryOption[]): Optional category options
- **Returns**: Promise\<boolean\>

#### setMode(mode)

Sets the audio session mode.

- **mode** (AudioMode): The mode to set
- **Returns**: Promise\<boolean\>

#### setActive(active)

Activates or deactivates the audio session.

- **active** (boolean): Whether to activate the session
- **Returns**: Promise\<boolean\>

## Performance Tips

1. Use the smallest model that meets your needs
2. Use quantized models for better performance (e.g., q4_0 variants)
3. For iOS, ensure the audio session is properly configured
4. For large vocabularies, consider using language-specific models

## License

MIT 