import React, { useState, useEffect } from 'react';
import { View, Button, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import WhisperKit from 'whisperkit-native';
import * as FileSystem from 'expo-file-system';

export default function WhisperKitExample() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (Platform.OS === 'ios') {
      initializeWhisperKit();
    } else {
      setError('WhisperKit is only available on iOS');
    }
    
    return () => {
      // Cleanup if streaming is active
      if (isStreaming) {
        stopStreaming();
      }
    };
  }, []);

  const initializeWhisperKit = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const initialized = await WhisperKit.initialize('large-v3');
      setIsInitialized(initialized);
    } catch (err) {
      setError(`Failed to initialize WhisperKit: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const transcribeAudioFile = async () => {
    if (!isInitialized) return;
    
    setIsLoading(true);
    setError('');
    setTranscription('');
    
    try {
      // Example using a bundled audio file
      // In a real app, you'd use a file picked by the user or recorded audio
      const audioPath = `${FileSystem.documentDirectory}sample.mp3`;
      
      // For demo purposes - you would have your own audio file
      // In a real app, you'd get this from the user or recording
      
      const result = await WhisperKit.transcribeFile(audioPath);
      setTranscription(result.text);
    } catch (err) {
      setError(`Transcription failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const startStreaming = async () => {
    if (!isInitialized) return;
    
    setError('');
    setTranscription('');
    setIsStreaming(true);
    
    try {
      await WhisperKit.startStreaming((update) => {
        setTranscription(update.text);
        
        if (update.isFinal) {
          console.log('Final transcription received');
        }
      });
    } catch (err) {
      setError(`Streaming failed: ${err.message}`);
      setIsStreaming(false);
    }
  };

  const stopStreaming = async () => {
    if (!isInitialized || !isStreaming) return;
    
    try {
      await WhisperKit.stopStreaming();
    } catch (err) {
      setError(`Failed to stop streaming: ${err.message}`);
    } finally {
      setIsStreaming(false);
    }
  };

  if (Platform.OS !== 'ios') {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>WhisperKit is only supported on iOS devices</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <>
          <Text style={styles.status}>
            Status: {isInitialized ? 'Initialized' : 'Not Initialized'}
          </Text>
          
          {!isInitialized && (
            <Button
              title="Initialize WhisperKit"
              onPress={initializeWhisperKit}
            />
          )}
          
          {isInitialized && !isStreaming && (
            <>
              <Button
                title="Transcribe Audio File"
                onPress={transcribeAudioFile}
              />
              <Button
                title="Start Streaming"
                onPress={startStreaming}
              />
            </>
          )}
          
          {isStreaming && (
            <Button
              title="Stop Streaming"
              onPress={stopStreaming}
              color="red"
            />
          )}
          
          {transcription ? (
            <View style={styles.transcriptionContainer}>
              <Text style={styles.transcriptionTitle}>Transcription:</Text>
              <Text style={styles.transcription}>{transcription}</Text>
            </View>
          ) : null}
          
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  status: {
    fontSize: 16,
    marginBottom: 20,
  },
  transcriptionContainer: {
    marginTop: 20,
    width: '100%',
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
  },
  transcriptionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  transcription: {
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    marginTop: 20,
    color: 'red',
    textAlign: 'center',
  },
}); 