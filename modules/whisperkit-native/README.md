# WhisperKit Native Module for React Native

This module provides React Native bindings for [WhisperKit](https://github.com/argmaxinc/WhisperKit), a high-performance on-device speech recognition system for iOS.

## Installation

1. Add the module to your project:
```
yarn add file:./modules/whisperkit-native
```

2. Run the prebuild command:
```
yarn prebuild
```

3. Install pods:
```
cd ios && pod install
```

4. Run the iOS app:
```
yarn ios
```

## Usage

```javascript
import WhisperKit from 'whisperkit-native';
import { Platform } from 'react-native';

// Only available on iOS
if (Platform.OS === 'ios') {
  // Initialize WhisperKit with a model
  await WhisperKit.initialize('large-v3');
  
  // Transcribe an audio file
  const result = await WhisperKit.transcribeFile('/path/to/audio.mp3');
  console.log(result.text); // Full transcription
  console.log(result.segments); // Array of segments with timestamps
  
  // Start streaming from microphone
  await WhisperKit.startStreaming((update) => {
    console.log(update.text); // Current transcription
    
    if (update.isFinal) {
      console.log('Final transcription received');
    }
  });
  
  // Stop streaming when done
  await WhisperKit.stopStreaming();
}
```

## API

### `initialize(modelName: string): Promise<boolean>`
Initializes WhisperKit with the specified model.

### `transcribeFile(audioPath: string): Promise<{text: string, segments: Array<{text: string, start: number, end: number}>}>`
Transcribes an audio file and returns the transcription with segments.

### `startStreaming(callback: (update: {text: string, isFinal: boolean}) => void): Promise<boolean>`
Starts streaming audio from the microphone and provides transcription updates via callback.

### `stopStreaming(): Promise<boolean>`
Stops the streaming audio transcription.

## Model Selection

WhisperKit supports different model sizes. Larger models are more accurate but use more resources:

- `tiny`
- `base`
- `small`
- `medium`
- `large-v1`
- `large-v2`
- `large-v3` (recommended for best quality)
- `distil-large-v3` (faster, slightly less accurate)

## Performance Considerations

- The larger models (especially `large-v3`) require more memory and processing power
- First-time initialization downloads the model, which may take some time
- Streaming transcription works best on newer iOS devices 