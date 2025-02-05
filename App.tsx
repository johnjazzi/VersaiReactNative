import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Platform, ScrollView } from 'react-native';
import { LogBox } from 'react-native';
import { initWhisper, WhisperContext, AudioSessionIos } from 'whisper.rn';
import { useEffect, useState, useRef } from 'react';
import React from 'react';
import { pipeline } from '@xenova/transformers';


export default function App() {
  const whisper = useRef<WhisperContext>();
  const [stopRecording, setStopRecording] = useState<(() => void) | null>(null);
  const [isModelInitialized, setIsModelInitialized] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [transcriptionLog, setTranscriptionLog] = useState<{text: string, timestamp: Date}[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState('Speaker 1');
  const autoSaveInterval = useRef<NodeJS.Timeout>();
  const stopRecordingRef = useRef<(() => void) | null>(null);
  
  const [translator_rom_to_en, setTranslatorRomToEn] = useState<any>(null);
  const [translator_en_to_rom, setTranslatorEnToRom] = useState<any>(null);



  useEffect(() => {
    (async () => {
      try {
        console.log('Loading Romance to English translator...');
        setLoadingStatus('Loading Romance to English translator...');
        try {
          const translator_rom_to_en = await pipeline('translation', 'Xenova/opus-mt-ROMANCE-en', {
            // progress_callback: (progress) => console.log(progress) 
          });
          setTranslatorRomToEn(translator_rom_to_en);
        } catch (error) {
          console.error('Detailed error:', error);
          setLoadingStatus('Error loading models: ' + error.message);
        }

        console.log('Loading English to Romance translator...');
        setLoadingStatus('Loading English to Romance translator...');
        const translator_en_to_rom = await pipeline('translation', 'Xenova/opus-mt-en-ROMANCE', {
          // progress_callback: (progress) => console.log(progress) 
        });
        setTranslatorEnToRom(translator_en_to_rom);

        const test_1 = await translator_rom_to_en('Bonjour, comment ça va?');
        console.log(test_1);

        const test_2 = await translator_en_to_rom('<fr> Hello, how are you?');
        console.log(test_2);


        setLoadingStatus('Initializing Whisper model...');
        let model;
        try {
          model = Platform.select({
            ios: require('./assets/models/ggml-base.bin'),
            android: require('./assets/models/ggml-base.bin'),
            default: require('./assets/models/ggml-base.bin')
          });
          if (!model) throw new Error('Model path not found');
        } catch (error) {
          throw new Error(`Failed to load model: ${error.message}`);
        }

        whisper.current = await initWhisper({
          filePath: model
        });

        setIsModelInitialized(true);
        setLoadingProgress(100);
        setLoadingStatus('Ready!');

      } catch (error) {
        console.error('Detailed error:', error);
        setLoadingStatus('Error loading models: ' + error.message);
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

    const { stop, subscribe } = await whisper.current.transcribeRealtime();

    setStopRecording(() => stop);

    // First, store stopRecording in a ref when it's created
    stopRecordingRef.current = stop;

    if (autoSaveInterval.current) {
      clearInterval(autoSaveInterval.current);
    }
    
    autoSaveInterval.current = setInterval(async () => {
      if (stop) {
        stop();
        startRecording();
      }
    }, 25000);

    let currentTranscript = '';

    subscribe(evt => {
      const { isCapturing, data } = evt;
      if (data?.result) {
        currentTranscript = data.result;
        setTranscript(currentTranscript);
      }

      if (!isCapturing) {
        // Clear interval when recording stops
        if (autoSaveInterval.current) {
          clearInterval(autoSaveInterval.current);
        }
        setTranscriptionLog(prev => [{text: currentTranscript, timestamp: new Date()}, ...prev]);
        setTranscript('');
        setStopRecording(null);
      }
    });
  };

  const switchSpeaker = async () => {
    if (stopRecording) {
      stopRecording();
      await new Promise(resolve => setTimeout(resolve, 50));
      //setCurrentSpeaker(prev => prev === 'Speaker 1' ? 'Speaker 2' : 'Speaker 1');
      startRecording();
    }
  };

  // Clean up interval on component unmount
  useEffect(() => {
    return () => {
      if (autoSaveInterval.current) {
        clearInterval(autoSaveInterval.current);
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      {loadingProgress < 100 && (
        <View style={styles.loadingContainer}>
          <Text>{loadingStatus}</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progress, { width: `${loadingProgress}%` }]} />
          </View>
        </View>
      )}
      

      <View style={styles.topSection}>
        <View style={styles.controlPanel}>
          <Button 
            title="Start" 
            onPress={startRecording}
            disabled={!isModelInitialized || !!stopRecording} 
          />
          <Button 
            title="Stop" 
            onPress={() => stopRecording?.()} 
            disabled={!stopRecording}
          />
          <Button 
            title="Switch Speaker" 
            onPress={switchSpeaker}
            disabled={!stopRecording}
          />
        </View>

        <View style={styles.transcriptContainer}>
          {stopRecording && <Text style={styles.recordingLabel}>Recording...</Text>}
          <Text>{transcript}</Text>
        </View>
      </View>

      <ScrollView style={styles.logContainer}>
        {transcriptionLog.map((item, index) => (
          <View key={index} style={styles.logItem}>
            <Text style={styles.logTimestamp}>{item.timestamp.toLocaleTimeString()}</Text>
            <Text>{item.text}</Text>
          </View>
        ))}
      </ScrollView>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topSection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    backgroundColor: '#fff',
    paddingBottom: 20,
  },
  controlPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '90%',
    marginBottom: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    alignSelf: 'center',
  },
  transcriptContainer: {
    width: '90%',
    padding: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignSelf: 'center',
  },
  logContainer: {
    flex: 1,
    width: '90%',
    marginTop: 260, // Adjust based on your content height
    alignSelf: 'center',
  },
  recordingLabel: {
    color: 'red',
    marginBottom: 10,
    fontWeight: 'bold',
  },
  loadingContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  progressBar: {
    width: 200,
    height: 20,
    backgroundColor: '#eee',
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 10,
  },
  progress: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  logItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 8,
  },
  logTimestamp: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
});
