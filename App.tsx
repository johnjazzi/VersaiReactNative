import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Platform, ScrollView, Modal, Switch, TextInput, TouchableOpacity} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LANGUAGE_MAP, LanguageMapping } from './services/Common';

import { LogBox } from 'react-native';
import { initWhisper, WhisperContext, AudioSessionIos } from 'whisper.rn';
import { useEffect, useState, useRef } from 'react';
import React from 'react';

// Conditionally import expo-device
let Device: any = null;
try {
  Device = require('expo-device');
} catch (error) {
  console.log('expo-device not available - likely running on simulator');
  Device = { isDevice: false, modelName: 'Simulator' };
}

import { IOSTranslateTasksProvider } from "react-native-ios-translate-tasks";

import { transcriptionService , useTranscriptionService , TranscriptionServiceState } from './services/TranscriptionService';
import { translationService , useTranslationService , TranslationServiceState, useIOSTranslateContext } from './services/TranslationService';

export function Main() {
  const whisper = useRef<WhisperContext>();
  const [stopRecording, setStopRecording] = useState<(() => void) | null>(null);
  const [isModelInitialized, setIsModelInitialized] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [translatedTranscript, setTranslatedTranscript] = useState('');
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [transcriptionLog, setTranscriptionLog] = useState<{text: string, translatedText: string, timestamp: Date, languageInfo?: string}[]>([]);
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

  useIOSTranslateContext();

  const { 
    useCloudTranslation,
    modelExists: translationModelExists,
    modelName: translationModelName,
    modelSize: translationModelSize,
    isInitialized: translationInitialized,
    isRealDevice 
  } = useTranslationService();

  const { 
    modelExists: transcriptionModelExists,
    modelName: transcriptionModelName,
    modelSize: transcriptionModelSize,
    isInitialized: transcriptionInitialized,
    whisperContext: transcriptionContext
  } = useTranscriptionService();

  // Helper function to get the target language based on recording language
  const getTargetLanguage = (sourceLanguage: string): string => {
    return sourceLanguage === languageOne ? languageTwo : languageOne;
  };

  // Helper function to get language display name from code
  const getLanguageDisplayName = (languageCode: string): string => {
    return Object.entries(LANGUAGE_MAP).find(([_, mapping]) => mapping.googleCode === languageCode)?.[0] || languageCode;
  };

  useEffect(() => {
    
    // INIT 
    (async () => {

      const lang_options = Object.entries(LANGUAGE_MAP).map(([key, value]: [string, LanguageMapping]) => ({
        value: value.googleCode,
        label: value.displayName
      }));
      setLangOptions(lang_options)
      
      // INIT Models
      try {
        console.log('Initializing models...');

        !transcriptionInitialized? await transcriptionService.initialize(setLoadingStatus, setLoadingProgress): null;
        !translationInitialized? await translationService.initialize(setLoadingStatus, setLoadingProgress): null;
        setIsModelInitialized(true);
        
      } catch (error: any) {
        setLoadingStatus('Error initializing models: ' + error.message);
      }

    })();
  }, [isModelInitialized]);

  const saveToTranscriptionLog = async (currentTranscript: {text: string, recordingLanguage: string}) => {
    //Get full language names from language codes
    const sourceLanguageName = getLanguageDisplayName(currentTranscript.recordingLanguage);
    const targetLanguageCode = getTargetLanguage(currentTranscript.recordingLanguage);
    const targetLanguageName = getLanguageDisplayName(targetLanguageCode);
    
    const translatedText = await translationService.translate(
      currentTranscript.text, 
      currentTranscript.recordingLanguage, 
      targetLanguageCode
    );
    
    if (currentTranscript.text) {
      setTranscriptionLog(prev => [{
        text: currentTranscript.text, 
        translatedText: translatedText,
        timestamp: new Date(),
        languageInfo: `${sourceLanguageName} → ${targetLanguageName}`
      }, ...prev]);
    }
  }

  const startRecording = async (language: string) => {

    //TODO Show a dot that is recording and a waveform so that user can see their voice is being picked up

    try {
      if (!transcriptionContext) return;
      setRecordingLanguage(language);

      if (Platform.OS === 'ios') {
        await AudioSessionIos.setCategory(
          AudioSessionIos.Category.PlayAndRecord,
          [AudioSessionIos.CategoryOption.MixWithOthers]
        );
        await AudioSessionIos.setMode(AudioSessionIos.Mode.Default);
        await AudioSessionIos.setActive(true);
      }

      const { stop, subscribe } = await transcriptionContext.transcribeRealtime({
        language: language
      });

      setStopRecording(() => stop);
      stopRecordingRef.current = stop;

      let currentTranscript = {text: '', recordingLanguage: recordingLanguage};

      subscribe(evt => {
        const { isCapturing, data } = evt;
        if (data?.result) {
          currentTranscript = {text: data.result, recordingLanguage: language};
          setTranscript(currentTranscript.text);
        }

        if (!isCapturing) {
          saveToTranscriptionLog(currentTranscript);
          setTranscript('');
          setTranslatedTranscript('');
          setStopRecording(null);
          stopRecordingRef.current = null;
        }
      });
    } catch (error) {
      console.error('Recording error:', error);
    }
  };

  const switchSpeaker = async () => {
    if (stopRecordingRef.current) {
      const newLanguage = recordingLanguage === languageOne ? languageTwo : languageOne;
      setRecordingLanguage(newLanguage);
      stopRecordingRef.current();
      await new Promise(resolve => setTimeout(resolve, 50));
      startRecording(newLanguage);
    }
  };

  useEffect(() => { async function translateTranscript() {
      if (transcript) {
        const targetLanguage = getTargetLanguage(recordingLanguage);
        const translatedText = await translationService.translate(transcript, recordingLanguage, targetLanguage);
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


  const deleteModel = async () => {
    try {
      await translationService.deleteModel(setLoadingStatus);

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
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              />
            </View>
            <MaterialIcons 
              name="mic" 
              size={28} 
              color={!isModelInitialized || !!stopRecording ? '#999999' : '#007AFF'} 
              onPress={() => startRecording(languageOne)}
              style={styles.iconButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              />
            </View>
            <MaterialIcons 
              name="mic" 
              size={28} 
              color={!isModelInitialized || !!stopRecording ? '#999999' : '#007AFF'} 
              onPress={() => startRecording(languageTwo)}
              style={styles.iconButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
            {stopRecording && (
              <Text style={styles.recordingContainer}>
                <Text style={styles.recordingLabel}>Recording</Text>
                <Text> {getLanguageDisplayName(recordingLanguage)} → {getLanguageDisplayName(getTargetLanguage(recordingLanguage))}</Text>
              </Text>
            )}
            <Text>{translatedTranscript}</Text>
            <Text style={{color: '#888', fontSize: 14}}>{transcript}</Text>
          </View>
        </View>

        <ScrollView style={styles.logContainer}>
          {transcriptionLog.map((item, index) => (
            <View key={index} style={styles.logItem}>
              <View style={styles.logHeader}>
                <Text style={styles.languageInfo}>{item.languageInfo}</Text>
                <Text style={styles.logTimestamp}>{item.timestamp.toLocaleTimeString()}</Text>
              </View>
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
          <Text style={styles.settingLabel}>Native Translation</Text>
          <View>
            {!isRealDevice && (
              <Text style={styles.disabledText}>Not available on simulator</Text>
            )}
            <Switch
              value={useCloudTranslation}
              onValueChange={(value) => {
                translationService.setCloudTranslation(value);
              }}
              disabled={!translationInitialized || !isRealDevice}
            />
          </View>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Translation Model</Text>
          {translationModelExists ? (
            <View style={styles.modelInfo}>
              <Text style={styles.modelText}>{translationModelName}</Text>
              <Text style={styles.modelText}>Status: Downloaded</Text>
              <Text style={styles.modelText}>Size: {(translationModelSize / (1000000000)).toFixed(2)} GB</Text>
              <Button 
                title="Delete Model" 
                onPress={deleteModel}
                color="red"
              />
            </View>
          ) : (
            <View style={styles.modelInfo}>
              <Text style={styles.modelText}>{translationModelName}</Text>
              <Text style={styles.modelText}>Status: Not Downloaded</Text>
              <Text style={styles.modelText}>Size: {(translationModelSize / (1000000000)).toFixed(2)} GB</Text>
              <Button 
                title="Download Model" 
                onPress={() => translationService.downloadModel(setLoadingProgress, setLoadingStatus)}
                disabled={loadingProgress < 100 && loadingProgress > 0}
              />
            </View>
          )}
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Transcription Model</Text>
          {transcriptionModelExists ? (
            <View style={styles.modelInfo}>
              <Text style={styles.modelText}>{transcriptionModelName}</Text>
              <Text style={styles.modelText}>Status: Downloaded</Text>
              <Text style={styles.modelText}>Size: {(transcriptionModelSize / (1000000000)).toFixed(2)} GB</Text>
              <Button 
                title="Delete Model" 
                onPress={deleteModel}
                color="red"
              />
            </View>
          ) : (
            <View style={styles.modelInfo}>
              <Text style={styles.modelText}>{transcriptionModelName}</Text>
              <Text style={styles.modelText}>Status: Not Downloaded</Text>
              <Text style={styles.modelText}>Size: {(transcriptionModelSize / (1000000000)).toFixed(2)} GB</Text>
              <Button 
                title="Download Model" 
                onPress={() => transcriptionService.downloadModel(setLoadingProgress, setLoadingStatus)}
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

export default function App() {
  // We'll render Main regardless, but IOSTranslateTasksProvider only on real device
  return (Device.isDevice ? 
    <IOSTranslateTasksProvider>
      <Main />
    </IOSTranslateTasksProvider>
    :
    <Main />
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
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  recordingLabel: {
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
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logTimestamp: {
    fontSize: 12,
    color: '#666',
  },
  languageInfo: {
    fontSize: 12,
    color: '#007AFF',
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
  recordingLang: {
    color: '#666',
    marginBottom: 10,
    fontSize: 14,
  },
  disabledText: {
    color: '#888',
    marginRight: 10,
  },
});


