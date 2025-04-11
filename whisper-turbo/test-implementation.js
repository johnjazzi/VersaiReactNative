import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Button,
  ScrollView,
  StyleSheet,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { initWhisper, AudioCategory, AudioCategoryOption, AudioMode, AudioSession } from './src';

// Path to your model file
const MODEL_PATH = Platform.OS === 'ios'
  ? `${FileSystem.documentDirectory}ggml-tiny.en.bin`
  : `${FileSystem.documentDirectory}ggml-tiny.en.bin`;

export default function WhisperTurboTest() {
  const [isModelInitialized, setIsModelInitialized] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  
  const whisperContext = useRef(null);
  
  // Request microphone permission on Android
  const requestMicrophonePermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'This app needs access to your microphone to transcribe audio.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.error('Failed to request microphone permission:', err);
        return false;
      }
    }
    return true; // iOS handles permissions differently
  };
  
  // Setup audio session for iOS
  const setupAudioSession = async () => {
    if (Platform.OS === 'ios') {
      try {
        await AudioSession.setCategory(
          AudioCategory.PlayAndRecord,
          [
            AudioCategoryOption.AllowBluetooth,
            AudioCategoryOption.DefaultToSpeaker,
          ]
        );
        await AudioSession.setMode(AudioMode.SpokenAudio);
        await AudioSession.setActive(true);
      } catch (err) {
        console.error('Failed to set up audio session:', err);
        setError('Failed to set up audio session: ' + err.message);
      }
    }
  };
  
  // Initialize the model
  const initializeModel = async () => {
    try {
      setStatus('Initializing model...');
      
      // Check if model file exists
      const modelExists = await FileSystem.getInfoAsync(MODEL_PATH);
      if (!modelExists.exists) {
        setError(`Model file not found at ${MODEL_PATH}`);
        setStatus('Model file not found');
        return;
      }
      
      // Request microphone permission
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        setError('Microphone permission denied');
        setStatus('Microphone permission denied');
        return;
      }
      
      // Set up audio session
      await setupAudioSession();
      
      // Initialize whisper
      whisperContext.current = await initWhisper(MODEL_PATH);
      setIsModelInitialized(true);
      setStatus('Model initialized');
    } catch (err) {
      console.error('Failed to initialize model:', err);
      setError('Failed to initialize model: ' + err.message);
      setStatus('Initialization failed');
    }
  };
  
  // Start streaming
  const startStreaming = async () => {
    if (!whisperContext.current) {
      setError('Model not initialized');
      return;
    }
    
    try {
      setStatus('Starting transcription...');
      setTranscript('');
      
      // Subscribe to transcription results
      const unsubscribe = whisperContext.current.subscribe((result) => {
        setTranscript(result.text);
      });
      
      // Start streaming
      await whisperContext.current.startStreaming({
        language: 'en', // Change as needed
      });
      
      setIsStreaming(true);
      setStatus('Transcribing...');
    } catch (err) {
      console.error('Failed to start streaming:', err);
      setError('Failed to start streaming: ' + err.message);
      setStatus('Streaming failed');
    }
  };
  
  // Stop streaming
  const stopStreaming = async () => {
    if (!whisperContext.current || !isStreaming) {
      return;
    }
    
    try {
      await whisperContext.current.stopStreaming();
      setIsStreaming(false);
      setStatus('Transcription stopped');
    } catch (err) {
      console.error('Failed to stop streaming:', err);
      setError('Failed to stop streaming: ' + err.message);
    }
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (whisperContext.current) {
        whisperContext.current.release().catch(console.error);
      }
    };
  }, []);
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Whisper Turbo Demo</Text>
      
      <Text style={styles.status}>Status: {status}</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      
      <View style={styles.buttonRow}>
        {!isModelInitialized ? (
          <Button
            title="Initialize Model"
            onPress={initializeModel}
            disabled={isModelInitialized}
          />
        ) : !isStreaming ? (
          <Button
            title="Start Transcription"
            onPress={startStreaming}
            disabled={!isModelInitialized || isStreaming}
          />
        ) : (
          <Button
            title="Stop Transcription"
            onPress={stopStreaming}
            disabled={!isStreaming}
            color="red"
          />
        )}
      </View>
      
      <ScrollView style={styles.transcriptContainer}>
        <Text style={styles.transcriptTitle}>Transcript:</Text>
        <Text style={styles.transcript}>
          {transcript || 'Transcript will appear here...'}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  status: {
    fontSize: 14,
    marginBottom: 10,
    color: '#666',
  },
  error: {
    fontSize: 14,
    marginBottom: 10,
    color: 'red',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  transcriptContainer: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  transcriptTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  transcript: {
    fontSize: 16,
    lineHeight: 24,
  },
}); 