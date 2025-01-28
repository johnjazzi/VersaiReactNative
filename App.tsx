import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Platform } from 'react-native';
import { LogBox } from 'react-native';
import { initWhisper, WhisperContext, AudioSessionIos } from 'whisper.rn';
import { useEffect, useState, useRef } from 'react';
import React from 'react';

export default function App() {
  const whisper = useRef<WhisperContext>();
  const [stopRecording, setStopRecording] = useState<(() => void) | null>(null);
  const [isModelInitialized, setIsModelInitialized] = useState(false);
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    (async () => {
      if (!isModelInitialized) {
        whisper.current = await initWhisper({
          filePath: require('./assets/models/ggml-base.bin'),
        });
        setIsModelInitialized(true);
      }
    })();
  }, [isModelInitialized]);

  const startRecording = async () => {
    if (!whisper.current) return;
    
    // Set up audio session for iOS
    if (Platform.OS === 'ios') {
      await AudioSessionIos.setCategory(
        AudioSessionIos.Category.PlayAndRecord,
        [AudioSessionIos.CategoryOption.MixWithOthers]
      );
      await AudioSessionIos.setMode(AudioSessionIos.Mode.Default);
      await AudioSessionIos.setActive(true);
    }

    const { stop, subscribe } = await whisper.current.transcribeRealtime({
      language: 'en',
    });

    setStopRecording(() => stop);

    subscribe(evt => {
      const { isCapturing, data } = evt;
      if (data?.result) {
        setTranscript(data.result);
      }
      if (!isCapturing) {
        setStopRecording(null);
      }
    });
  };

  return (
    <View style={styles.container}>
      <Text>{transcript}</Text>
      <Button 
        title="Start Recording" 
        onPress={startRecording}
        disabled={!isModelInitialized || !!stopRecording} 
      />
      <Button 
        title="Stop Recording" 
        onPress={() => stopRecording?.()} 
        disabled={!stopRecording}
      />
      <Button 
        title= "clear"
        onPress={() => setTranscript('')}
        disabled={!transcript}
      />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
