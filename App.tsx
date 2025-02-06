import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Platform, ScrollView, Modal} from 'react-native';
import {Picker} from '@react-native-picker/picker';

import { LogBox } from 'react-native';
import { initWhisper, WhisperContext, AudioSessionIos } from 'whisper.rn';
import { useEffect, useState, useRef } from 'react';
import React from 'react';
import { pipeline, env } from '@xenova/transformers';
import * as FileSystem from 'expo-file-system';


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

  const [selectedLanguage, setSelectedLanguage] = useState<string>('pt');
  const [langOptions, setLangOptions] = useState<{value: string, label: string}[]>([]);

  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);



  useEffect(() => {
    (async () => {

      const lang_options = [ 
        {value: 'fr', label: 'French'}, 
        {value: 'it', label: 'Italian'}, 
        {value: 'es', label: 'Spanish'}, 
        {value: 'pt', label: 'Portuguese'}];
      setLangOptions(lang_options)

      try {


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
        setLoadingProgress(10);


        
        const modelDir = FileSystem.documentDirectory + 'assets/models/';
        env.localModelPath = modelDir;
        env.allowLocalModels = true;

        await FileSystem.makeDirectoryAsync(modelDir, { intermediates: true }).catch(() => {});


        console.log('Loading Romance to English translator...');
        setLoadingStatus('Loading Romance to English translator...');
        setLoadingProgress(30);
        try {
          const translator_rom_to_en = await pipeline('translation', 'Xenova/opus-mt-ROMANCE-en', {
            // progress_callback: (progress) => console.log(progress) 
          });

          const test_1 = await translator_rom_to_en('Bonjour, comment ça va?');
          console.log(test_1);

          setTranslatorRomToEn(translator_rom_to_en);
        } catch (error) {
          console.error('Detailed error:', error);
          setLoadingStatus('Error loading models: ' + error.message);
        }

        console.log('Loading English to Romance translator...');
        setLoadingStatus('Loading English to Romance translator...');
        setLoadingProgress(60);
        try {
          const translator_en_to_rom = await pipeline('translation', 'Xenova/opus-mt-en-ROMANCE', {
            // progress_callback: (progress) => console.log(progress) 
          });
          const test_2 = await translator_en_to_rom('<fr> Hello, how are you?');
          console.log(test_2);

          setTranslatorEnToRom(translator_en_to_rom);
        } catch (error) {
          console.error('Detailed error:', error);
          setLoadingStatus('Error loading models: ' + error.message);
        }

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
      <View style={[styles.topSection, { position: 'relative' }]}>
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
        <View style={styles.controlPanel}>
          <Button 
            title={langOptions.find(l => l.value === selectedLanguage)?.label || 'Select'}
            onPress={() => setShowSourceModal(true)}
          />
          <Button 
            title="switch" 
            onPress={() => stopRecording?.()} 
            disabled={!stopRecording}
          />
          <Button 
            title="English"
            onPress={() => setShowTargetModal(true)}
          />

          <Modal
            visible={showSourceModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowSourceModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                {langOptions.map((lang) => (
                  <Button
                    key={lang.value}
                    title={lang.label}
                    onPress={() => {
                      setSelectedLanguage(lang.value);
                      setShowSourceModal(false);
                    }}
                  />
                ))}
                <Button title="Cancel" onPress={() => setShowSourceModal(false)} />
              </View>
            </View>
          </Modal>

          <Modal
            visible={showTargetModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowTargetModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Button title="English" onPress={() => setShowTargetModal(false)} />
                <Button title="Cancel" onPress={() => setShowTargetModal(false)} />
              </View>
            </View>
          </Modal>
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

      {loadingProgress < 100 && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <Text>{loadingStatus}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progress, { width: `${loadingProgress}%` }]} />
            </View>
          </View>
        </View>
      )}

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
    backgroundColor: '#fff',
    paddingBottom: 20,
    zIndex: 1,
  },
  controlPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '90%',
    marginBottom: 10,
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
    alignSelf: 'center',
  },
  recordingLabel: {
    color: 'red',
    marginBottom: 10,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    minWidth: 200,
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
  pickerContainer: {
    flex: 1,
    maxWidth: '40%',
  },
  picker: {
    height: 40,
  },
  loadingOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  loadingContainer: {
    padding: 15,
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 10,
    backgroundColor: '#eee',
    borderRadius: 5,
    marginTop: 10,
  },
  progress: {
    height: '100%',
    backgroundColor: 'blue',
    borderRadius: 5,
  },
});
