import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { LANGUAGE_MAP, LanguageMapping } from './Common';
import { initWhisper, WhisperContext, AudioSessionIos } from 'whisper.rn';
import { TranslationServiceState } from './TranslationService';
import { useEffect, useState, useRef } from 'react';

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
  transcriptionResult: string;
  isRecording: boolean;
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
  private _transcriptionResult: string = '';
  private _stopRecording: (() => void) | null = null;
  private _isRecording: boolean = false;
  private _isCapturing: boolean = false;
  private _recordingLanguage: string = 'en';
  private listeners: Set<(state: TranscriptionServiceState) => void> = new Set();
  private _onTranscriptionCompleteCallback: ((text: string, language: string) => void) | null = null;
 
  setOnTranscriptionCompleteCallback(callback: ((text: string, language: string) => void) | null) {
    this._onTranscriptionCompleteCallback = callback;
  }

  async checkIfbundledModelExists() {
    try {
      const bundledModelPath = `${FileSystem.bundleDirectory}assets/models/${this._modelName}`;
      console.log(bundledModelPath)
      const modelInfo = await FileSystem.getInfoAsync(bundledModelPath);
      console.log(modelInfo)
      return modelInfo.exists;
    } catch (error) {
      console.error('Error checking bundled model:', error);
      return false;
    }
  }


  async initialize(
      setLoadingStatus?: (status: string) => void, 
      setLoadingProgress?: (progress: number) => void) {
    try {

      setLoadingStatus?.('Initializing Whisper model...');
      this._modelPath = `${FileSystem.documentDirectory}${this._modelName}`;
      const modelInfo = await FileSystem.getInfoAsync(this._modelPath);
      
      if (!modelInfo.exists) {
        setLoadingProgress?.(100);
        setLoadingStatus?.('Model not found');
        throw new Error('Model not found');
      }

      this._modelSize = modelInfo.size;
      this._exists = true;
      setLoadingProgress?.(10);

      // this.context = await initWhisper({
      //   filePath: this._modelPath,
      // });

      this.context = await initWhisper({
        filePath: this._modelPath,
        coreMLModelAsset: Platform.OS === 'ios' ? {
          filename: this._modelName.replace('.bin', '-encoder.mlmodelc'),
          assets: [
            `${FileSystem.documentDirectory}${this._modelName.replace('.bin', '-encoder.mlmodelc/weights/weight.bin')}`,
            `${FileSystem.documentDirectory}${this._modelName.replace('.bin', '-encoder.mlmodelc/model.mil')}`,
            `${FileSystem.documentDirectory}${this._modelName.replace('.bin', '-encoder.mlmodelc/coremldata.bin')}`,
          ],
        } : undefined,
      });

      console.log('Whisper context initialized');

      setLoadingProgress?.(80);

      console.log('warming transcription context');
      const silentWav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      //this.context.transcribe(silentWav)
      console.log('transcription context warmed up');

      setLoadingProgress?.(100);
      setLoadingStatus?.('Ready!');

      this._isInitialized = true;
      this.notifyListeners();

    } catch (error: any) {
      console.error('Detailed error:', error);
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


  async startTranscription(language: string = 'en') {
    if (!this.context) {
      throw new Error('Whisper context not initialized');
    }

    if (this._isRecording) return;

    this._isRecording = true;
    this._recordingLanguage = language;
    this._transcriptionResult = '';
    this.notifyListeners()

    await AudioSessionIos.setCategory(
      AudioSessionIos.Category.PlayAndRecord, 
      [AudioSessionIos.CategoryOption.MixWithOthers],
    )
    await AudioSessionIos.setMode(AudioSessionIos.Mode.Default)
    await AudioSessionIos.setActive(true)

    const { stop, subscribe } = await this.context.transcribeRealtime({
      language: language,
      realtimeAudioMinSec: 1.0,
    })

    this._stopRecording = stop;

    subscribe(evt => {
      const { isCapturing, data, processTime, recordingTime } = evt
      this._isCapturing = isCapturing;

      if (data?.result) {
        this._transcriptionResult = data.result;
        //console.log(isCapturing, data, processTime, recordingTime)
        this.notifyListeners(); 
      }

      if (!isCapturing) {
        console.log('Finished realtime transcribing')
      }
    })
  }

  async stopTranscription() { 
    if (!this.context || !this._stopRecording) return;

    this._stopRecording();
    await new Promise(resolve => setTimeout(resolve, 100)); //wait for any existing transcriptions to end

    this._isRecording = false;
    this._onTranscriptionCompleteCallback?.(this._transcriptionResult, this._recordingLanguage);
    this._transcriptionResult = '';
    this.notifyListeners();
  }

  getState(): TranscriptionServiceState {
    return {
      modelExists: this._exists,
      modelName: this._modelName,
      modelSize: this._modelSize,
      isInitialized: this._isInitialized,
      whisperContext: this.context,
      transcriptionResult: this._transcriptionResult,
      isRecording: this._isRecording
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