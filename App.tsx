import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Platform, ScrollView, Modal} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import { MaterialIcons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';

import { LogBox } from 'react-native';
import { initWhisper, WhisperContext, AudioSessionIos } from 'whisper.rn';
import { useEffect, useState, useRef } from 'react';
import React from 'react';
import * as FileSystem from 'expo-file-system';

import { initLlama, LlamaContext } from 'llama.rn';


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
  
  const [selectedLanguage, setSelectedLanguage] = useState<string>('pt');
  const [langOptions, setLangOptions] = useState<{value: string, label: string}[]>([]);
  const [recordingLanguage, setRecordingLanguage] = useState<string>('');

  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);

  const [translationModel, setTranslationModel] = useState(null);
  const [translationContext, setTranslationContext] = useState(null);

  useEffect(() => {
    // INIT WHISPER FOR TRANSCRIPTION
    (async () => {

      const lang_options = [ 
        {value: 'french', label: 'French'}, 
        {value: 'italian', label: 'Italian'}, 
        {value: 'spanish', label: 'Spanish'}, 
        {value: 'portuguese', label: 'Portuguese'}];
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

  useEffect(() => {
    // INIT LLAMA FOR TRANSLATION
    (async () => {
      try {
        setLoadingStatus('Checking for LLaMA model...');
        
        const modelName = 'llama-3.2-1b-instruct-q4_k_m.gguf';
        const modelPath = `${FileSystem.documentDirectory}${modelName}`;
        
        console.log('LLaMA model path:', modelPath);
        
        const modelInfo = await FileSystem.getInfoAsync(modelPath);
        console.log('Model exists?', modelInfo.exists);
        
        if (!modelInfo.exists) {
          setLoadingStatus('Downloading LLaMA model...');
          
          const downloadResumable = FileSystem.createDownloadResumable(
            'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-IQ3_M.gguf',
            modelPath,
            {},
            (downloadProgress) => {
              const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
              setLoadingProgress(Math.round(progress * 100));
              setLoadingStatus(`Downloading LLaMA model: ${Math.round(progress * 100)}%`);
            }
          );
          
          const downloadResult = await downloadResumable.downloadAsync();
          console.log('Download completed:', downloadResult);
          
          if (!downloadResult || !downloadResult.uri) {
            throw new Error('Download failed');
          }
        }
        
        // Initialize Llama with the model
        try {
          setLoadingStatus('Initializing translation model...');
          const llamaContext = await initLlama({
            model: modelPath,
            use_mlock: true,
            n_ctx: 2048,
            n_batch: 512,
            n_gpu_layers: Platform.OS === 'ios' ? 1 : 0,
          });
          
          setTranslationContext(llamaContext);
          
          // Add a test translation to verify the model works
          setLoadingStatus('Testing translation model...');
          try {

            const test = await translateText("hello world", "english", "portuguese");
            console.log('Test translation result:', test);
            
           } catch (testError) {
            console.error('Test translation failed:', testError);
            setLoadingStatus('Translation model initialized but test failed. Check console for details.');
          }
        } catch (llamaError) {
          console.error('Llama initialization error:', llamaError);
          setTranslationContext(null);
          setLoadingStatus('Error initializing translation model. Some features may be unavailable.');
        }
        
      } catch (error) {
        console.error('Model loading error:', error);
        setLoadingStatus('Error: ' + error.message);
      }


    })();
  }, []);

  const saveToTranscriptionLog = async (text: string) => {
    const translatedText = await translateText(text, recordingLanguage, (recordingLanguage === 'english') ? selectedLanguage : 'english');
    
    if (text) {
      setTranscriptionLog(prev => [{
        text: text, 
        translatedText: translatedText,
        timestamp: new Date()
      }, ...prev]);
    }
  }

  const startRecording = async (language: string) => {
    if (!whisper.current) return;

    setRecordingLanguage(language);
    
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
  };

  const switchSpeaker = async () => {
    if (stopRecording) {
      stopRecording();
      await new Promise(resolve => setTimeout(resolve, 50));
      //setCurrentSpeaker(prev => prev === 'Speaker 1' ? 'Speaker 2' : 'Speaker 1');
      if (recordingLanguage === 'en') 
        { startRecording(selectedLanguage); }
      else 
        { startRecording('en'); }
    }
  };

  const translateText = async (text: string, sourceLang: string, targetLang: string) => {
    if (!text || !translationContext) return text;
    
    try {
      // Create a prompt for translation
      // Format the prompt based on the language codes
      const sourceLanguageName = sourceLang;
      const targetLanguageName = targetLang;
      
      const stopWords = ['</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|EOT|>', '<|END_OF_TURN_TOKEN|>', '<|end_of_turn|>', '<|endoftext|>']

      const prompt = `
        <|start_header_id|>system<|end_header_id|>
        You are a translation assistant. Please translate the given text to the target language accurately while preserving the meaning.
        user input is formatted as: text <target=language>

        <|eot_id|><|start_header_id|>user input<|end_header_id|>
        ${text} 
        <target=${targetLanguageName}>
        <|eot_id|>
        <|start_header_id|>translation<|end_header_id|>
      `;
      
      // Run inference
      const textResult = await translationContext.completion({
        prompt,
        n_predict: text.length+20,
        stop: [...stopWords, 'Llama:', 'User:', '\n\n'],
        temperature: 0.7,
        top_p: 0.95,
        repeat_penalty: 1.2,
      });
      
      return textResult.text;
    } catch (error) {
      console.error('Translation error:', error);
      return text;
    }
  };

  // Helper function to get full language name from code
  const getLanguageName = (code: string) => {
    const languageMap = {
      'en': 'English',
      'fr': 'French',
      'es': 'Spanish',
      'it': 'Italian',
      'pt': 'Portuguese',
      // Add more languages as needed
    };
    
    return languageMap[code] || code;
  };

  useEffect(() => { async function translateTranscript() {
      if (transcript) {

        const translatedText = await translateText(transcript, recordingLanguage, (recordingLanguage === 'en') ?  selectedLanguage : 'en');
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

  return (
    <View style={styles.container}>
      <View style={[styles.topSection, { position: 'relative' }]}>
        <View style={styles.row}>
          <View style={styles.buttonWithIcon}>
            <Text style={styles.languageText}>
              {langOptions.find(l => l.value === selectedLanguage)?.label || 'Select'}
            </Text>
            <MaterialIcons 
                name="unfold-more" 
                size={24} 
                color="#007AFF" 
                style={styles.buttonIcon} 
                onPress={() => setShowSourceModal(true)}
              />
              {/* {!translator_rom_to_en && (
                <MaterialIcons name="error" size={24} color="red" />
              )} */}
          </View>
          <MaterialIcons 
            name="mic" 
            size={28} 
            color={!isModelInitialized || !!stopRecording ? '#999999' : '#007AFF'} 
            onPress={() => startRecording(selectedLanguage)}
            style={styles.iconButton}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.buttonWithIcon}>
            <Text style={styles.languageText}>English</Text>
            <MaterialIcons 
              name="unfold-more" 
              size={24} 
              color="#007AFF" 
              style={styles.buttonIcon} 
              onPress={() => setShowTargetModal(true)}
            />
            {/* {!translator_en_to_rom && (
              <MaterialIcons name="error" size={24} color="red" />
            )} */}

          </View>
          <MaterialIcons 
            name="mic" 
            size={28} 
            color={!isModelInitialized || !!stopRecording ? '#999999' : '#007AFF'} 
            onPress={() => startRecording('en')}
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
          {stopRecording && <Text style={styles.recordingLabel}>Recording in {recordingLanguage}...</Text>}
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
});
