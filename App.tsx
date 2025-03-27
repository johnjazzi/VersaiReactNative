import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Platform, ScrollView, Modal, Switch, TextInput, TouchableOpacity} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import { MaterialIcons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import { LANGUAGE_MAP, LanguageMapping } from './services/Common';

import { LogBox } from 'react-native';
import { initWhisper, WhisperContext, AudioSessionIos } from 'whisper.rn';
import { useEffect, useState, useRef } from 'react';
import React from 'react';
import * as FileSystem from 'expo-file-system';


import { transcriptionService } from './services/TranscriptionService';
import { translationService } from './services/TranslationService';


export default function App() {
  const whisper = useRef<WhisperContext>();
  const [stopRecording, setStopRecording] = useState<(() => void) | null>(null);
  const [isModelInitialized, setIsModelInitialized] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [translatedTranscript, setTranslatedTranscript] = useState('');
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [transcriptionLog, setTranscriptionLog] = useState<{text: string, translatedText: string, timestamp: Date}[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState('Speaker 1');
  const autoSaveInterval = useRef<NodeJS.Timeout>();
  const stopRecordingRef = useRef<(() => void) | null>(null);
  
  const [languageOne, setLanguageOne] = useState<string>('pt');
  const [languageTwo, setLanguageTwo] = useState<string>('en');
  const [langOptions, setLangOptions] = useState<{value: string, label: string}[]>([]);
  const [recordingLanguage, setRecordingLanguage] = useState<string>('pt');

  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);

  const [activeTab, setActiveTab] = useState<'translation' | 'settings'>('translation');
  const [modelInfo, setModelInfo] = useState<{ exists: boolean; size?: number, name?: string }>({ exists: false });

  useEffect(() => {
    // INIT WHISPER FOR TRANSCRIPTION
    (async () => {

      //TODO: fix this with common.ts
      const lang_options = Object.entries(LANGUAGE_MAP).map(([key, value]: [string, LanguageMapping]) => ({
        value: value.googleCode,
        label: value.displayName
      }));
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

        setLoadingProgress(100);
        setLoadingStatus('Ready!');

      } catch (error) {
        console.error('Detailed error:', error);
        setLoadingStatus('Error loading models: ' + error.message);
      }
    })();
  }, [isModelInitialized]);

  const saveToTranscriptionLog = async (text: string) => {
    const translatedText = await translationService.translate(text, languageTwo, (languageTwo === 'en') ? languageOne : 'en');
    
    if (text) {
      setTranscriptionLog(prev => [{
        text: text, 
        translatedText: translatedText,
        timestamp: new Date()
      }, ...prev]);
    }
  }

  const startRecording = async (language: string) => {
    try {
      if (!whisper.current) return;
      
      setRecordingLanguage(language);

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
          startRecording(language);
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
          saveToTranscriptionLog(currentTranscript);
          setTranscript('');
          setTranslatedTranscript('');
          setStopRecording(null);
        }
      });
    } catch (error) {
      console.error('Recording error:', error);
    }
  };

  const switchSpeaker = async () => {
    if (stopRecording) {
      stopRecording();
      await new Promise(resolve => setTimeout(resolve, 50));
      if (languageTwo === 'en') 
        { startRecording(languageOne); }
      else 
        { startRecording('en'); }
    }
  };



  useEffect(() => { async function translateTranscript() {
      if (transcript) {
        const translatedText = await translationService.translate(transcript, languageTwo, (languageTwo === 'en') ? languageOne : 'en');
        setTranslatedTranscript(translatedText);
      }
    }
  translateTranscript();
  }, [transcript]);


  // Clean up interval on component unmount
  useEffect(() => {
    return () => {
      if (autoSaveInterval.current) {
        clearInterval(autoSaveInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    // Check model info when settings tab is active
    if (activeTab === 'settings') {
      (async () => {
        try {
          const modelInfo = await translationService.updateModelInfo();
          setModelInfo(modelInfo);
        } catch (error) {
          console.error('Error updating model info:', error);
        }
      })();
    }
  }, [activeTab]);



  useEffect(() => {
    // Initialize transcription
    (async () => {
      try {
        await transcriptionService.initialize(setLoadingStatus);
        setIsModelInitialized(true);
      } catch (error) {
        setLoadingStatus('Error initializing transcription: ' + error.message);
      }
    })();
  }, []);

  useEffect(() => {
    // Initialize translation service
    (async () => {
      try {
        await translationService.initialize(setLoadingStatus);
        // Update state with service info

        const modelInfo = await translationService.updateModelInfo();
        setModelInfo(modelInfo);
      } catch (error) {
        console.error('Translation service initialization error:', error);
        setLoadingStatus('Error: ' + error.message);
      }
    })();
  }, []);


  const deleteModel = async () => {
    try {
      await translationService.deleteModel(setLoadingStatus);
      const modelInfo = await translationService.updateModelInfo();
      setModelInfo({
        exists: modelInfo.exists,
        size: modelInfo.size
      });
    } catch (error) {
      console.error('Error deleting model:', error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'translation' && styles.activeTab]} 
          onPress={() => setActiveTab('translation')}
        >
          <Text style={[styles.tabText, activeTab === 'translation' && styles.activeTabText]}>Translation</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'settings' && styles.activeTab]} 
          onPress={() => setActiveTab('settings')}
        >
          <Text style={[styles.tabText, activeTab === 'settings' && styles.activeTabText]}>Settings</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'translation' ? (
        <View style={styles.content}>
          <View style={[styles.topSection, { position: 'relative' }]}>
            <View style={styles.row}>
              <View style={styles.buttonWithIcon}>
                <Text style={styles.languageText}>
                  {langOptions.find(l => l.value === languageOne)?.label || 'Select'}
                </Text>
                <MaterialIcons 
                    name="unfold-more" 
                    size={24} 
                    color="#007AFF" 
                    style={styles.buttonIcon} 
                    onPress={() => setShowSourceModal(true)}
                  />
              </View>
              <MaterialIcons 
                name="mic" 
                size={28} 
                color={!isModelInitialized || !!stopRecording ? '#999999' : '#007AFF'} 
                onPress={() => startRecording(languageOne)}
                style={styles.iconButton}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.buttonWithIcon}>
                <Text style={styles.languageText}>
                  {langOptions.find(l => l.value === languageTwo)?.label || 'Select'}
                </Text>
                <MaterialIcons 
                  name="unfold-more" 
                  size={24} 
                  color="#007AFF" 
                  style={styles.buttonIcon} 
                  onPress={() => setShowTargetModal(true)}
                />
              </View>
              <MaterialIcons 
                name="mic" 
                size={28} 
                color={!isModelInitialized || !!stopRecording ? '#999999' : '#007AFF'} 
                onPress={() => startRecording(languageTwo)}
                style={styles.iconButton}
              />
            </View>

            <View style={styles.row}>
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
              {stopRecording && <Text style={styles.recordingLabel}>Recording in {languageTwo}...</Text>}
              <Text>{translatedTranscript}</Text>
              <Text style={{color: '#888', fontSize: 14}}>{transcript}</Text>
            </View>
          </View>

          <ScrollView style={styles.logContainer}>
            {transcriptionLog.map((item, index) => (
              <View key={index} style={styles.logItem}>
                <Text style={styles.logTimestamp}>{item.timestamp.toLocaleTimeString()}</Text>
                <Text>{item.translatedText}</Text>
                {item.text && (
                  <Text style={{color: '#888', fontSize: 14}}>{item.text}</Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.settingsContainer}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Cloud Translation</Text>
            <Switch
              value={translationService.useCloudTranslation}
              onValueChange={(value) => {
                translationService.setCloudTranslation(!translationService.useCloudTranslation);
              }}
              disabled={!translationService.isModelAvailable}
            />
          </View>


          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Translation Model</Text>
            {modelInfo.exists ? (
              <View style={styles.modelInfo}>
                <Text style={styles.modelText}>{modelInfo.name}</Text>
                <Text style={styles.modelText}>Status: Downloaded</Text>
                <Text style={styles.modelText}>Size: {(modelInfo.size / (1000000000)).toFixed(2)} GB</Text>
                <Button 
                  title="Delete Model" 
                  onPress={deleteModel}
                  color="red"
                />
              </View>
            ) : (
              <View style={styles.modelInfo}>
                <Text style={styles.modelText}>{translationService.modelName}</Text>
                <Text style={styles.modelText}>Status: Not Downloaded</Text>
                <Text style={styles.modelText}>Size: {(translationService.modelSize / (1000000000)).toFixed(2)} GB</Text>
                <Button 
                  title="Download Model" 
                  onPress={() => translationService.downloadModel(setLoadingProgress, setLoadingStatus)}
                  disabled={loadingProgress < 100 && loadingProgress > 0}
                />
              </View>
            )}
          </View>
        </View>
      )}

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
                  setLanguageOne(lang.value);
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
            {langOptions.map((lang) => (
              <Button
                key={lang.value}
                title={lang.label}
                onPress={() => {
                  setLanguageTwo(lang.value);
                  setShowTargetModal(false);
                }}
              />
            ))}
            <Button title="Cancel" onPress={() => setShowTargetModal(false)} />
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
  },
  topSection: {
    backgroundColor: '#fff',
    paddingBottom: 20,
    zIndex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '90%',
    marginBottom: 20,
    paddingHorizontal: 20,
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
  languageText: {
    fontSize: 14,
    marginRight: 5,
  },
  buttonWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    padding: 10,  // Add padding for better touch target
  },
  iconButton: {
    padding: 10,  // Add some padding for better touch target
  },
  iconContainer: {
    position: 'relative',
  },
  errorDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    backgroundColor: 'red',
    borderRadius: 4,
  },
  translationModeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  apiKeyInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  settingsContainer: {
    flex: 1,
    padding: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  settingLabel: {
    fontSize: 16,
  },
  modelSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  modelInfo: {
    gap: 8,
    margin:8,

  },
  modelText: {
    fontSize: 14,
    color: '#666',
  },
});
