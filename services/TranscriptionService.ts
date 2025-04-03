import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { LANGUAGE_MAP, LanguageMapping } from './Common';
import { initWhisper, WhisperContext, AudioSessionIos } from 'whisper.rn';
import { TranslationServiceState } from './TranslationService';
import { useEffect, useState, useRef } from 'react';
import { Asset } from 'expo-asset';

// Safe import approach that doesn't cause NativeEventEmitter issues
let ZipArchive: any = null;
if (Platform.OS === 'ios') {
  try {
    ZipArchive = require('react-native-zip-archive');
  } catch (e) {
    console.warn('react-native-zip-archive module not available');
  }
}

export interface TranscriptionServiceState {
  modelExists: boolean;
  modelName: string;
  modelSize: number;
  isInitialized: boolean;
  whisperContext: WhisperContext | null;
}

export function useTranscriptionService() {
  const [state, setState] = useState<TranscriptionServiceState>(
    () => transcriptionService.getState()
  );

  useEffect(() => {
    const unsubscribe = transcriptionService.subscribe(setState);
    return () => unsubscribe();
  }, []);

  return state;
}

const modelFiles = [
  {
    name: 'ggml-tiny.bin',
    modelUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin',
  },
  {
    name: 'ggml-tiny-encoder.mlmodelc.zip',
    modelUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-encoder.mlmodelc.zip',
  }
]

export class TranscriptionService {
  private _modelName: string = 'ggml-tiny.bin';
  private _modelUrl: string = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${this._modelName}`;
  private _exists: boolean = false;
  private _modelPath: string = '';
  private _modelSize: number = 0;
  private _isInitialized: boolean = false;  
  private context: WhisperContext | null = null;

  private listeners: Set<(state: TranscriptionServiceState) => void> = new Set();

  async initialize(
      setLoadingStatus?: (status: string) => void, 
      setLoadingProgress?: (progress: number) => void) {
    try {
      setLoadingStatus?.('Initializing Whisper model...');
      setLoadingProgress?.(10);

      // Clear existing context if any
      if (this.context) {
        try {
          await this.context.release();
        } catch (e) {
          console.log('Error releasing existing context:', e);
        }
        this.context = null;
      }

      const modelAsset = Asset.fromModule(require('../assets/models/ggml-tiny.bin'));
      await modelAsset.downloadAsync();

      this._modelPath = `${FileSystem.documentDirectory}ggml-tiny.bin`;
      const modelInfo = await FileSystem.getInfoAsync(this._modelPath);
      console.log('Model path:', this._modelPath);
      console.log('Model info:', modelInfo);
      
      this.context = await initWhisper({
        filePath: this._modelPath,
        coreMLModelAsset: undefined,
        useCoreMLIos: false,
        useGpu: false
      });

      console.log('Context:', this.context);
    
      console.log('Whisper context initialized successfully');
      
      // Initialize with a basic transcription to warm up the model
      // This can help ensure audio sessions are properly set up
      if (this.context) {
        let testComplete = false;
        for (let attempt = 1; attempt <= 2 && !testComplete; attempt++) {
          try {
            console.log(`Test transcription attempt ${attempt}...`);
            
            // Create a silent audio buffer
            const silentAudio = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
            
            // Do a quick test transcription with minimal settings
            const result = this.context.transcribe(String(silentAudio), {
              language: 'en',
              translate: false
            });
            
            console.log('Whisper test transcription completed successfully');
            testComplete = true;
          } catch (e) {
            console.log(`Test transcription error on attempt ${attempt}:`, e);
            
            if (attempt === 2) {
              console.log('Test transcription failed but continuing anyway');
            }
          }
        }
      }

      this._modelSize = 0;
      this._exists = true;

      setLoadingProgress?.(100);
      setLoadingStatus?.('Ready!');
      this._isInitialized = true;
      this.notifyListeners();

    } catch (error: any) {
      this._isInitialized = false;
      this.context = null;
      console.error('Detailed error:', error.message);
      setLoadingStatus?.('Error loading models: ' + error.message);
    }
  }

  async downloadModel(
    onProgress: (progress: number) => void,
    setLoadingStatus: (status: string) => void
  ): Promise<void> {
    try {
      // Download each model file sequentially
      for (const modelFile of modelFiles) {
        const filePath = `${FileSystem.documentDirectory}${modelFile.name}`;
        setLoadingStatus(`Downloading ${modelFile.name}...`);

        const downloadResumable = FileSystem.createDownloadResumable(
          modelFile.modelUrl,
          filePath,
          {},
          (downloadProgress) => {
            const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            onProgress(Math.round(progress * 100));
            setLoadingStatus(`Downloading ${modelFile.name}... ${Math.round(progress * 100)}%`);
          }
        );
        
        const result = await downloadResumable.downloadAsync();
        if (!result?.uri) throw new Error(`Download failed for ${modelFile.name}`);
        
        // Handle zip files - for iOS we need to handle the Core ML models
        if (modelFile.name.endsWith('.zip') && Platform.OS === 'ios') {
          setLoadingStatus('Extracting model files...');
          const extractDir = FileSystem.documentDirectory || '';
          
          try {
            // Check if ZipArchive is available
            if (ZipArchive && ZipArchive.unzip) {
              // Unzip the file
              await ZipArchive.unzip(filePath, extractDir);
              
              // Remove the zip file after extraction
              await FileSystem.deleteAsync(filePath);
              
              setLoadingStatus('Model files extracted successfully');
            } else {
              setLoadingStatus('Zip extraction not available on this device. You may need to manually extract the files.');
            }
          } catch (error) {
            console.error('Extraction error:', error);
            setLoadingStatus('Error extracting zip file. iOS Core ML model may not be available.');
          }
        }
      }
      
      // Set the model path to the main model file
      this._modelPath = `${FileSystem.documentDirectory}${this._modelName}`;
      setLoadingStatus('Models downloaded successfully!');
      
      // Initialize after download
      await this.initialize(setLoadingStatus, onProgress);
    } catch (error: any) {
      console.error('Download error:', error);
      setLoadingStatus('Error downloading model: ' + error.message);
      throw error;
    }
  }

  async deleteModel(setLoadingStatus: (status: string) => void): Promise<void> {
    try {
      setLoadingStatus('Deleting models...');
      
      // Delete main model file
      const mainModelPath = `${FileSystem.documentDirectory}${this._modelName}`;
      const mainModelInfo = await FileSystem.getInfoAsync(mainModelPath);
      if (mainModelInfo.exists) {
        await FileSystem.deleteAsync(mainModelPath);
      }
      
      // Delete Core ML model directory if on iOS
      if (Platform.OS === 'ios') {
        const coreMLDirPath = `${FileSystem.documentDirectory}${this._modelName.replace('.bin', '-encoder.mlmodelc')}`;
        const coreMLDirInfo = await FileSystem.getInfoAsync(coreMLDirPath);
        if (coreMLDirInfo.exists && coreMLDirInfo.isDirectory) {
          await FileSystem.deleteAsync(coreMLDirPath, { idempotent: true });
        }
      }
      
      this.context = null;
      this._exists = false;
      this._isInitialized = false;
      this._modelSize = 0;
      this.notifyListeners();
      
      setLoadingStatus('Models deleted successfully!');
    } catch (error: any) {
      console.error('Delete error:', error);
      setLoadingStatus('Error deleting models: ' + error.message);
      throw error;
    }
  }

  getState(): TranscriptionServiceState {
    return {
      modelExists: this._exists,
      modelName: this._modelName,
      modelSize: this._modelSize,
      isInitialized: this._isInitialized,
      whisperContext: this.context
    };
  }

  private notifyListeners() {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }

  subscribe(listener: (state: TranscriptionServiceState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {this.listeners.delete(listener);}
  }

}

export const transcriptionService = new TranscriptionService(); 