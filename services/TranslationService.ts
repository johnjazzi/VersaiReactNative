import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { initLlama, LlamaContext } from 'llama.rn';
import { LANGUAGE_MAP, LanguageMapping } from './Common';
import { useEffect, useState, useRef } from 'react';


export interface TranslationServiceState {
  useCloudTranslation: boolean;
  modelExists: boolean;
  modelName: string;
  modelSize: number;
  isInitialized: boolean;
}

export function useTranslationService() {
  const [state, setState] = useState<TranslationServiceState>(
    () => translationService.getState()
  );

  useEffect(() => {
    const unsubscribe = translationService.subscribe(setState);
    return () => unsubscribe();
  }, []);

  return state;
}


export interface TranslationSettings {
  useCloudTranslation: boolean;
  googleApiKey?: string;
}

export class TranslationService {
  private _modelName: string = 'Llama-3.2-1B-Instruct-Q8_0.gguf';
  private _modelUrl: string = `https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/${this._modelName}`;
  private _modelPath: string = '';
  private _modelSize: number = 0 ;
  private _exists: boolean = false;
  private _isInitialized: boolean = false;
  private _useCloudTranslation: boolean = true;
  private context: LlamaContext | null = null;
  private settings: TranslationSettings = {
    useCloudTranslation: true,
    googleApiKey: process.env.GOOGLE_TRANSLATE_API_KEY || ''
  };
  private listeners: Set<(state: TranslationServiceState) => void> = new Set();


  get googleApiKey(): string {
    return this.settings.googleApiKey || '';
  }

  async setCloudTranslation(value: boolean): Promise<void> {
    this.settings.useCloudTranslation = value;
    this.notifyListeners();
  }

  setGoogleApiKey(key: string): void {
    this.settings.googleApiKey = key;
  }

  async updateModelInfo() {
    try {
      this._modelPath = `${FileSystem.documentDirectory}${this._modelName}`;
      console.log('Model path:', this._modelPath);

      // Ensure directory exists
      if (!FileSystem.documentDirectory) {
        console.error('Document directory is null');
        throw new Error('Document directory is null');
      }

      const dirInfo = await FileSystem.getInfoAsync(FileSystem.documentDirectory);
      if (!dirInfo.exists) {
        console.error('Document directory does not exist');
        throw new Error('Document directory does not exist');
      }

      const info = await FileSystem.getInfoAsync(this._modelPath);
      console.log('File info:', info);
      this._modelSize = info.exists ? (info as any).size : 0;
      this._exists = info.exists;
      this.notifyListeners();
      return {
        exists: info.exists,
        name: this._modelName,
        size: this._modelSize,
        path: this._modelPath
      };
    } catch (error: any) {
      console.error('Error updating model info:', error);
      throw error;
    }
  }

  async initialize(
    setLoadingStatus?: (status: string) => void , 
    setLoadingProgress?: (progress: number) => void) {
    try {
      console.log('Initializing translation model...');

      if (this._isInitialized) {
        console.log('Translation model already initialized');
        return;
      }

      this._modelPath = `${FileSystem.documentDirectory}${this._modelName}`;
      const modelInfo = await FileSystem.getInfoAsync(this._modelPath);
      
      if (!modelInfo.exists) {
        this._useCloudTranslation = true;
        console.log('Translation model not found');
        return;
      }

      this._modelSize = modelInfo.size;
      this._exists = true;
      
      this.context = await initLlama({
        model: this._modelPath,
        use_mlock: true,
        n_ctx: 2048,
        n_gpu_layers: 99
      });

      console.log('Translation model initialized');

      // Test translation
      
      this.settings.useCloudTranslation = false;
      await this.translate("hello world", "en", "pt");
      this._isInitialized = true;


    } catch (error) {
      this._isInitialized = false;
      this.settings.useCloudTranslation = true;
      console.error('Translation initialization error:', error);
      throw error;
    }
  }

  async downloadModel(
    onProgress: (progress: number) => void,
    setLoadingStatus: (status: string) => void
  ): Promise<void> {
    try {
      this._modelPath = `${FileSystem.documentDirectory}${this._modelName}`
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
    } catch (error: any) {
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
    } catch (error: any) {
      console.error('Delete error:', error);
      setLoadingStatus('Error deleting model: ' + error.message);
      throw error;
    }
  }


  async cloudTranslate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!text) return text;
    if (!this.settings.googleApiKey) {
      console.error('Google API key not configured');
      throw new Error('Google API key not configured');
      
    }

    try {
      // Find the language mapping by code


      const response = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${this.settings.googleApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: text,
            source: sourceLang,
            target: targetLang,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Google Translate API error:', errorData);
        throw new Error(`Translation API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      if (data.data?.translations?.[0]?.translatedText) {
        return data.data.translations[0].translatedText;
      }
      return '';
    } catch (error) {
      console.error('Cloud translation error:', error);
      throw error;
    }
  }

  async deviceTranslate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!text) return text;
    if (!this.context) {
      throw new Error('Translation model not initialized');
    }

    try {
      const prompt = `Translate this to ${targetLang}: ${text}`;

      const result = await this.context.completion({
        prompt,
        n_predict: text.length + 20,
        stop: ['\n'],  // Simplified stop token
        temperature: 0.7,
        top_p: 0.95,
      })

      return result.text;
    } catch (error) {
      console.error('Device translation error:', error);
      throw error;
    }
  }

  async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!text) return text;
    
    try {
      if (this.settings.useCloudTranslation) {
        return this.cloudTranslate(text, sourceLang, targetLang);
      } else if (this.context) {
        return this.deviceTranslate(text, sourceLang, targetLang);
      } else {
        throw new Error('no translation model available');
      }
    } catch (error) {
      console.error('Translation error details:', error);
      throw error;
    } 
  }

  get isModelAvailable(): boolean {
    return this._isInitialized && !!this._modelPath;
  }

  getState(): TranslationServiceState {
    return {
      useCloudTranslation: this.settings.useCloudTranslation,
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

  subscribe(listener: (state: TranslationServiceState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {this.listeners.delete(listener);}
  }
}

export const translationService = new TranslationService(); 