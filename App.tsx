import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Platform, ScrollView } from 'react-native';
import { LogBox } from 'react-native';
import { initWhisper, WhisperContext, AudioSessionIos } from 'whisper.rn';
import { useEffect, useState, useRef } from 'react';
import React from 'react';
import { TokenizerLoader } from "@lenml/tokenizers";


export default function App() {
  const whisper = useRef<WhisperContext>();
  const [stopRecording, setStopRecording] = useState<(() => void) | null>(null);
  const [isModelInitialized, setIsModelInitialized] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [transcriptionLog, setTranscriptionLog] = useState<{text: string, timestamp: Date}[]>([]);
  // const [tokenizer_rom_to_en, setTokenizerRomToEn] = useState<any>(null);
  // const [tokenizer_en_to_rom, setTokenizerEnToRom] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoadingStatus('Loading Romance to English tokenizer...');
        setLoadingProgress(0);
        const sourceUrls_rom_to_en = {
          tokenizerJSON: "https://huggingface.co/Xenova/opus-mt-ROMANCE-en/resolve/main/tokenizer.json?download=true",
          tokenizerConfig: "https://huggingface.co/Xenova/opus-mt-ROMANCE-en/resolve/main/tokenizer_config.json?download=true"
        }

        const sourceUrls_en_to_rom = {
          tokenizerJSON: "https://huggingface.co/Xenova/opus-mt-en-ROMANCE/resolve/main/tokenizer.json?download=true",
          tokenizerConfig: "https://huggingface.co/Xenova/opus-mt-en-ROMANCE/resolve/main/tokenizer_config.json?download=true"
        }

        // const tokenizer_rom_to_en = await TokenizerLoader.fromPreTrainedUrls(
        //   sourceUrls_rom_to_en
        // );
        // setLoadingProgress(25);
        // console.log('First tokenizer loaded successfully');

        // setLoadingStatus('Loading English to Romance tokenizer...');
        // const tokenizer_en_to_rom = await TokenizerLoader.fromPreTrainedUrls(
        //   sourceUrls_en_to_rom
        // );

        // setTokenizerRomToEn(tokenizer_rom_to_en);
        // setTokenizerEnToRom(tokenizer_en_to_rom);



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

    let currentTranscript = '';

    subscribe(evt => {
      const { isCapturing, data } = evt;
      if (data?.result) {
        currentTranscript = data.result;
        setTranscript(currentTranscript);
        console.log('Transcript:', currentTranscript);
      }

      if (!isCapturing) {
        console.log('Transcript:', currentTranscript);
        setTranscriptionLog(prev => [{text: currentTranscript, timestamp: new Date()}, ...prev]);
        setTranscript('');
        setStopRecording(null);
      }
    });
  };

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
            title="Clear"
            onPress={() => setTranscript('')}
            disabled={!transcript}
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
