import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { initLlama, LlamaContext } from 'llama.rn';
import { LANGUAGE_MAP, LanguageMapping , getAppleCodeFromGoogleCode } from './Common';
import { useEffect, useState, useRef } from 'react';
import { useIOSTranslateTasks } from 'react-native-ios-translate-tasks';
import RNFS from 'react-native-fs';

// Import for Device
let Device: any = null;
try {
  Device = require('expo-device');
} catch (error) {
  console.log('expo-device not available - likely running on simulator');
  Device = { isDevice: false, modelName: 'Simulator' };
}

export interface TranslationServiceState {
  translationMode: 'cloud' | 'ios' | 'llm';
  modelExists: boolean;
  modelName: string;
  modelSize: number;
  isInitialized: boolean;
  isRealDevice: boolean;
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
  private _modelName: string = 'qwen2.5-1.5b-instruct-q4_0.gguf';
  private _modelUrl: string = `https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_0.gguf`;
  private _modelPath: string = '';
  private _modelSize: number = 0 ;
  private _exists: boolean = false;
  private _isInitialized: boolean = false;
  private _iosTranslateContext: any | null = null;
  private _isRealDevice: boolean = Device?.isDevice || false;
  private _translationMode: 'cloud' | 'ios' | 'llm' = Device?.isDevice ? 'ios' : 'cloud';
  private context: LlamaContext | null = null;
  private settings: TranslationSettings = {
    useCloudTranslation: true,
    googleApiKey: process.env.GOOGLE_TRANSLATE_API_KEY || ''
  };
  private listeners: Set<(state: TranslationServiceState) => void> = new Set();

  get googleApiKey(): string {
    return this.settings.googleApiKey || '';
  }

  get translationMode(): 'cloud' | 'ios' | 'llm' {
    return this._translationMode;
  }

  async setTranslationMode(mode: 'cloud' | 'ios' | 'llm') {
    switch (mode) {
      case 'llm':
        if (this._exists === true && this._isInitialized === false) {
          await this.initializeLLM();
        }
        break;
      case 'ios':
        if (this._isRealDevice === false) {
          return;
        }
        break;
    }

    this._translationMode = mode;
    this.notifyListeners();
  }

  setIOSTranslateContext(context: any): void {
    this._iosTranslateContext = context;
  }

  async setCloudTranslation(value: boolean): Promise<void> {
    // On simulator, never allow cloud translation
    if (!this._isRealDevice && value) {
      console.log('Cannot use cloud translation on simulator, using device model only');
      this.settings.useCloudTranslation = false;
      this.notifyListeners();
      return;
    }
    
    this.settings.useCloudTranslation = value;
    console.log('setting cloud translation to', value)
    if (value && this._isRealDevice) { 
      const test = await this.IOSTranslate("hello world", "en", "pt");
      console.log(test)
    }

    this.notifyListeners();
  }

  setGoogleApiKey(key: string): void {
    this.settings.googleApiKey = key;
  }

  async checkModelInfo() {
    try {
      const dirInfo = await RNFS.readDir(RNFS.DocumentDirectoryPath);
      
      const modelFile = dirInfo.find(file => file.name === this._modelName);
      if (!modelFile) {
        this._exists = false;
        this._modelSize = 0;
        console.log('Model not found');
        this.notifyListeners();
        return false;
      } 
      this._exists = true;
      this._modelPath = modelFile.path;
      this._modelSize = modelFile.size;
      this.notifyListeners();
      return true;
    } catch (error: any) {
      console.error('Error updating model info:', error);
      
      throw error;
    }
  }

  async initializeLLM(
    setLoadingStatus?: (status: string) => void , 
    setLoadingProgress?: (progress: number) => void) {
    try {
      setLoadingStatus?.('Initializing translation model...')
      setLoadingProgress?.(40);
      this.context = await initLlama({
        model: this._modelPath,
        use_mlock: true,
        n_ctx: 2048,
        n_gpu_layers: 99
      });

      setLoadingStatus?.('Translation model loaded, Warming...');
      setLoadingProgress?.(80);
      this.settings.useCloudTranslation = false;
      const test = await this.translate("hello world", "en", "pt");
      console.log(test)
      this._isInitialized = true;
      this.notifyListeners();
      setLoadingStatus?.('Done!');
      setLoadingProgress?.(100);
      
    } catch (error) {
      console.error('Translation initialization error:', error);
      throw error;
    }
  }
  
  async initialize(
    setLoadingStatus?: (status: string) => void , 
    setLoadingProgress?: (progress: number) => void) {
    try {

      console.log('Initializing translation model...');
      setLoadingProgress?.(10);

      if (this._isInitialized) {
        setLoadingProgress?.(100);
        return;
      }

      const modelInfo = await this.checkModelInfo();

      if (!modelInfo) {;
        setLoadingStatus?.('Translation model not found');
        setLoadingProgress?.(100);
        return;
      }
      
      if (this.translationMode === 'cloud' || this.translationMode === 'ios') {
        setLoadingProgress?.(100);
        return;
      }

      await this.initializeLLM(setLoadingStatus, setLoadingProgress);
      
      setLoadingProgress?.(100);
      return;

    } catch (error) {
      setLoadingProgress?.(100);
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
      console.log('Downloading model...');
      this._modelPath = `${RNFS.DocumentDirectoryPath}/${this._modelName}`
      
      const result = await RNFS.downloadFile({
        fromUrl: this._modelUrl,
        toFile: this._modelPath,
        begin: () => {
          setLoadingStatus('Downloading model...');
          onProgress(0);
        },
        progress: res => {
          const progress = (res.bytesWritten / res.contentLength) * 100;
          onProgress(Math.round(progress));
          setLoadingStatus(
            `Downloading ${this._modelName} ... ${Math.round(progress)}%`
          );
        }
      }).promise;

      if (result.statusCode === 200) {
        setLoadingStatus('Model downloaded successfully!');
        onProgress(100);
      } else {
        console.error(
          `Download failed with status: ${result.statusCode}`,
        );
        throw new Error(`Download failed with status: ${result.statusCode}`);
      }

      
      await this.checkModelInfo();
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
      await RNFS.unlink(this._modelPath);
      this.context?.release();
      this.context = null;
      this._isInitialized = false;
      this._exists = false;
      this._modelPath = '';
      this._modelSize = 0;
      this.notifyListeners();
      setLoadingStatus('Model deleted successfully!');
    } catch (error: any) {
      console.error('Delete error:', error);
      setLoadingStatus('Error deleting model: ' + error.message);
      throw error;
    }
  }


  async deviceTranslate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!text) return text;
    if (!this.context) {
      throw new Error('Translation model not initialized');
    }


    
    try {
      const systemPrompt = `
      you are a translation assistant, you will be given a text and you will need to translate it from one language to another.
      you will need to return the translated text and nothing else.
      `
      const prompt = `
      <${LANGUAGE_MAP[sourceLang as keyof LanguageMapping]}> "${text}" <${LANGUAGE_MAP[targetLang as keyof LanguageMapping]}>
      `
      
      const result = await this.context.completion({
        messages:[
          {role: 'system', content: systemPrompt},
          {role: 'user', content: prompt}
        ],
        n_predict: text.length + 20,
        stop: ['\n','<|im_end|>' ],  // Simplified stop token
        temperature: 0.7,
        top_p: 0.95,
      })

      const out = result.text.replace(/<\|im_end\|>/g, "").replace(/"/g, "");

      return out;
    } catch (error) {
      console.error('Device translation error:', error);
      throw error;
    }
  }

  async IOSTranslate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (!text) return text;

    const sourceAppleCode = getAppleCodeFromGoogleCode(sourceLang);
    const targetAppleCode = getAppleCodeFromGoogleCode(targetLang);

    try {
      const { translatedTexts } = await this._iosTranslateContext.startIOSTranslateTasks(
        [text],
        {
          sourceLanguage:  sourceAppleCode,
          targetLanguage: targetAppleCode,
        }
      );
      return translatedTexts[0] || text; // Return first translation or original text if failed
    } catch (error) {
      console.error('iOS translation error:', error);
      throw error;
    }
  }

  async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {

    switch (this.translationMode) {
      case 'cloud':
        return text;
      case 'ios':
        //if (this._isRealDevice) return text;
        return this.IOSTranslate(text, sourceLang, targetLang);
      case 'llm':
        if (!this.context || !this._exists) return text;
        return this.deviceTranslate(text, sourceLang, targetLang);
    }
    
  }

  get isModelAvailable(): boolean {
    return this._isInitialized && !!this._modelPath;
  }

  getState(): TranslationServiceState {
    return {
      translationMode: this._translationMode,
      modelExists: this._exists,
      modelName: this._modelName,
      modelSize: this._modelSize,
      isInitialized: this._isInitialized,
      isRealDevice: this._isRealDevice
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


export function useIOSTranslateContext() {
  // Skip on simulator
  if (!Device.isDevice) {
    return;
  }

  const iosTranslateContext = useIOSTranslateTasks();
  
  useEffect(() => {
    if (iosTranslateContext) {
      translationService.setIOSTranslateContext(iosTranslateContext);
    }
  }, [iosTranslateContext]);
}