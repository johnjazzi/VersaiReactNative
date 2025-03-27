import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { LANGUAGE_MAP, LanguageMapping } from './Common';
import { initWhisper, WhisperContext, AudioSessionIos } from 'whisper.rn';
import { TranslationServiceState } from './TranslationService';


export interface TranscriptionServiceState {
  modelExists: boolean;
  modelName: string;
  modelSize: number;
  isInitialized: boolean;
}


export class TranscriptionService {
  private _modelName: string = 'ggml-small.bin';
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

      setLoadingStatus('Initializing Whisper model...');
      const modelInfo = await FileSystem.getInfoAsync(this._modelPath);
      if (!modelInfo.exists) {
        throw new Error('Model not found');
      }
      console.log('Model path:', this._modelPath);
      console.log('Model info:', JSON.stringify(modelInfo, null, 2));
      
      this.context = await initWhisper({
        filePath:this._modelPath
      });

      setLoadingProgress(10);

      setLoadingProgress(100);
      setLoadingStatus('Ready!');
      this._isInitialized = true;
      this.notifyListeners();

    } catch (error) {
      console.error('Detailed error:', error);
      setLoadingStatus('Error loading models: ' + error.message);
    }
  }

  async downloadModel(
    onProgress: (progress: number) => void,
    setLoadingStatus: (status: string) => void
  ): Promise<void> {
    try {
      setLoadingStatus('Downloading model...');
      const downloadResumable = FileSystem.createDownloadResumable(
        this._modelUrl,
        this._modelPath,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          onProgress(Math.round(progress * 100));
          setLoadingStatus(`Downloading model... ${Math.round(progress * 100)}%`);
        }
      );
      
      const result = await downloadResumable.downloadAsync();
      if (!result?.uri) throw new Error('Download failed');
      
      setLoadingStatus('Model downloaded successfully!');
      
      // Initialize after download
      await this.initialize(setLoadingStatus);
    } catch (error) {
      console.error('Download error:', error);
      setLoadingStatus('Error downloading model: ' + error.message);
      throw error;
    }
  }

  async deleteModel(setLoadingStatus: (status: string) => void): Promise<void> {
    try {
      setLoadingStatus('Deleting model...');
      await FileSystem.deleteAsync(this._modelPath);
      this.context = null;
      setLoadingStatus('Model deleted successfully!');
    } catch (error) {
      console.error('Delete error:', error);
      setLoadingStatus('Error deleting model: ' + error.message);
      throw error;
    }
  }

  getState(): TranscriptionServiceState {
    return {
      modelExists: this._exists,
      modelName: this._modelName,
      modelSize: this._modelSize,
      isInitialized: this._isInitialized
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