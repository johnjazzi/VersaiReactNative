import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { LANGUAGE_MAP, LanguageMapping } from './Common';
import { initWhisper, WhisperContext, AudioSessionIos } from 'whisper.rn';


export interface ModelInfo {
  exists: boolean;
  size?: number;
  name?: string;
}


export class TranscriptionService {
  private _modelName: string = 'ggml-small.bin';
  private _modelUrl: string = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${this._modelName}`;
  private _modelPath: string = '';
  private _modelSize: number = 0;
  private _isInitialized: boolean = false;
  private context: WhisperContext | null = null;

  async updateModelInfo() {
    try {
      this._modelPath = `${FileSystem.documentDirectory}${this._modelName}`;
      const info = await FileSystem.getInfoAsync(this._modelPath);
      this._modelSize = info.exists ? (info as any).size : 0;
      return {
        exists: info.exists,
        name: this._modelName,
        size: this._modelSize,
        path: this._modelPath
      };
    } catch (error) {
      console.error('Error updating model info:', error);
      throw error;
    }
  }

  async initialize(
      setLoadingStatus?: (status: string) => void, 
      setLoadingProgress?: (progress: number) => void) {
    try {
      await this.updateModelInfo();
      if (!this._modelSize) {
        throw new Error('Model not found');
      }

      setLoadingStatus('Initializing Whisper model...');
      const modelInfo = await FileSystem.getInfoAsync(this._modelPath);
      console.log('Model path:', this._modelPath);
      console.log('Model info:', JSON.stringify(modelInfo, null, 2));
      
      this.context = await initWhisper({
        filePath:this._modelPath
      });

      setLoadingProgress(10);

      setLoadingProgress(100);
      setLoadingStatus('Ready!');
      this._isInitialized = true;

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
      
      await this.updateModelInfo();
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


}

export const transcriptionServiceService = new TranscriptionService(); 