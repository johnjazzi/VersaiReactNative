# Implementation Steps

Follow these steps to integrate WhisperKit into your React Native + Expo app:

## 1. Install the local module

Add the local module to your package.json:

```bash
yarn add file:./modules/whisperkit-native
```

## 2. Run prebuild to generate native code

```bash
yarn prebuild
```

This will:
1. Generate the iOS folder
2. Run our post-prebuild script to modify the Podfile to include WhisperKit

## 3. Install pods

```bash
cd ios && pod install
```

This will download and install WhisperKit and its dependencies.

## 4. Using the module in your app

```javascript
import React, { useState, useEffect } from 'react';
import { View, Button, Text } from 'react-native';
import WhisperKit from 'whisperkit-native';

function YourComponent() {
  const [transcription, setTranscription] = useState('');
  
  const initializeAndTranscribe = async () => {
    try {
      // Initialize WhisperKit with the model
      await WhisperKit.initialize('large-v3');
      
      // Start streaming from microphone
      await WhisperKit.startStreaming((update) => {
        setTranscription(update.text);
      });
    } catch (error) {
      console.error('WhisperKit error:', error);
    }
  };
  
  const stopTranscription = async () => {
    try {
      await WhisperKit.stopStreaming();
    } catch (error) {
      console.error('Error stopping transcription:', error);
    }
  };
  
  return (
    <View>
      <Button title="Start Transcription" onPress={initializeAndTranscribe} />
      <Button title="Stop Transcription" onPress={stopTranscription} />
      <Text>{transcription}</Text>
    </View>
  );
}
```

## 5. Building for production

When building for production, make sure to:

1. Set the correct deployment target (iOS 16.0+) in your app.json
2. Include the WhisperKit module in your dependencies
3. Test on real devices as WhisperKit requires significant resources

## Troubleshooting

### Model download issues

If the model doesn't download automatically:
- Check your network connection
- Try a smaller model like 'base' or 'small' first
- Manually download models using the WhisperKit CLI tool

### Performance issues

- Larger models (large-v3) require more powerful devices
- Consider using 'distil-large-v3' for better performance
- Streaming mode uses more resources than file transcription

### Build errors

- Make sure you're using Xcode 15+ and iOS 16.0+ as the deployment target
- Check that SwiftUI and AVFoundation frameworks are included
- If you get Swift version errors, make sure you're using Swift 5.7+ 