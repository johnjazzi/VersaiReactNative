import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import { LANGUAGE_MAP, LanguageMapping } from "./Common";
import { AudioCategory, AudioCategoryOption, AudioMode, AudioSession, WhisperContext, initWhisper } from "../whisper-turbo/src";
import { useEffect, useState, useRef } from "react";
import { Audio } from "expo-av";
import RNFS from 'react-native-fs';

export interface TranscriptionServiceTurboState {
  modelExists: boolean;
  modelName: string;
  modelSize: number;
  isInitialized: boolean;
  whisperContext: WhisperContext | null;
  transcriptionResult: string;
  isRecording: boolean;
}

export function useTranscriptionServiceTurbo() {
  const [state, setState] = useState<TranscriptionServiceTurboState>(() =>
    transcriptionServiceTurbo.getState(),
  );

  useEffect(() => {
    const unsubscribe = transcriptionServiceTurbo.subscribe(setState);
    return () => unsubscribe();
  }, []);

  return state;
}

export class TranscriptionServiceTurbo {
  private _modelName: string = "ggml-tiny";
  private _exists: boolean = false;
  private _modelSize: number = 0;
  private _isInitialized: boolean = false;
  private context: WhisperContext | null = null;
  private _transcriptionResult: string = "";
  private _unsubscribe: (() => void) | null = null;
  private _isRecording: boolean = false;
  private _recordingLanguage: string = "en";
  private listeners: Set<(state: TranscriptionServiceTurboState) => void> =
    new Set();
  private _onTranscriptionCompleteCallback:
    | ((text: string, language: string) => void)
    | null = null;
  private noEventsTimeout: NodeJS.Timeout | null = null;

  setOnTranscriptionCompleteCallback(
    callback: ((text: string, language: string) => void) | null,
  ) {
    this._onTranscriptionCompleteCallback = callback;
  }

  async checkIfModelExists() {
    try {
      const basePath = Platform.OS === 'ios' 
        ? `${RNFS.DocumentDirectoryPath}` 
        : `${RNFS.DocumentDirectoryPath}`;
      const modelPath = `${basePath}/${this._modelName}.bin`;

      const exists = await RNFS.exists(modelPath);
      
      if (!exists) {
        console.error("Model file not found:", modelPath);
        return { exists: false, path: null };
      }

      return {
        exists: true,
        path: modelPath
      };
    } catch (error) {
      console.error("Error checking model file:", error);
      return { exists: false, path: null };
    }
  }

  async initialize(
    setLoadingStatus?: (status: string) => void,
    setLoadingProgress?: (progress: number) => void,
  ) {
    try {
      setLoadingStatus?.("Initializing Whisper model...");
      const { exists, path } = await this.checkIfModelExists();

      if (!exists || !path) {
        throw new Error("Model not found");
      }
      
      this._exists = true;
      setLoadingProgress?.(10);

      // Set up audio session for iOS
      if (Platform.OS === 'ios') {
        try {
          await AudioSession.setCategory(
            AudioCategory.PlayAndRecord,
            [
              AudioCategoryOption.AllowBluetooth,
              AudioCategoryOption.DefaultToSpeaker,
            ]
          );
          await AudioSession.setMode(AudioMode.SpokenAudio);
          await AudioSession.setActive(true);
        } catch (err) {
          console.error('Failed to set up audio session:', err);
        }
      }

      setLoadingProgress?.(30);

      // Initialize whisper model
      this.context = await initWhisper(path);
      console.log("Whisper context initialized with turbo module");

      setLoadingProgress?.(100);
      setLoadingStatus?.("Ready!");

      this._isInitialized = true;
      this.notifyListeners();
    } catch (error: any) {
      console.error("Detailed error:", error);
      setLoadingStatus?.("Error loading models: " + error.message);
    }
  }

  async downloadModel(
    onProgress: (progress: number) => void,
    setLoadingStatus: (status: string) => void,
  ): Promise<void> {
    try {
      // Download each model file sequentially

        const filePath = `${RNFS.DocumentDirectoryPath}/${this._modelName}.bin`

        const result = await RNFS.downloadFile({
          fromUrl: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${this._modelName}.bin`,
          toFile: filePath,
          begin: () => {
            setLoadingStatus('Downloading model...');
            onProgress(0);
          },
          progress: (res) => {
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


        setLoadingStatus("Models downloaded successfully!");
        // Initialize after download
        await this.initialize(setLoadingStatus, onProgress);
      
    } catch (error: any) {
      console.error("Download error:", error);
      setLoadingStatus("Error downloading model: " + error.message);
      throw error;
    }
  }

  async deleteModel(setLoadingStatus: (status: string) => void): Promise<void> {
    // Implementation would go here for deleting the model
    // This is just a placeholder
    throw new Error("Delete not implemented yet");
  }

  async startTranscription(language: string = "en") {
    if (!this.context) {
      throw new Error("Whisper context not initialized");
    }

    if (this._isRecording) return;
    console.log("Starting transcription with language:", language);

    await Audio.requestPermissionsAsync();

    this._isRecording = true;
    this._recordingLanguage = language;
    this._transcriptionResult = "";
    this.notifyListeners();

    // Track fallback timeout
    this.noEventsTimeout = setTimeout(() => {
      if (this._isRecording && this._transcriptionResult === "") {
        console.log("No transcription events received in 5 seconds, forcing test event");
        this._transcriptionResult = "Test transcription - no real events received";
        this.notifyListeners();
      }
    }, 5000);

    // Make sure any previous subscription is cleared
    if (this._unsubscribe) {
      try {
        this._unsubscribe();
      } catch (error) {
        console.error("Error cleaning up previous subscription:", error);
      }
      this._unsubscribe = null;
    }

    // Subscribe to transcription results with added debugging
    try {
      // Force a small delay to ensure everything is set up properly
      await new Promise(resolve => setTimeout(resolve, 100));
      
      this._unsubscribe = this.context.subscribe((result: { text: string; progress: number }) => {
        console.log("Received transcription result:", JSON.stringify(result));
        
        // Only process if we're still recording
        if (!this._isRecording) {
          console.log("Received event but no longer recording, ignoring");
          return;
        }
        
        if (result.text && result.text.length > 0) {
          this._transcriptionResult = result.text;
          console.log("Updated transcription result:", this._transcriptionResult);
          
          // Clear the fallback timeout since we've received real events
          if (this.noEventsTimeout) {
            clearTimeout(this.noEventsTimeout);
            this.noEventsTimeout = null;
          }
          
          this.notifyListeners();
        } else {
          console.log("Received empty result, ignoring");
        }
      });
      console.log("Successfully subscribed to transcription events");
    } catch (error) {
      console.error("Error subscribing to transcription events:", error);
      // Clean up on error
      this._isRecording = false;
      if (this.noEventsTimeout) {
        clearTimeout(this.noEventsTimeout);
        this.noEventsTimeout = null;
      }
      this.notifyListeners();
      throw error;
    }

    // Start streaming with sliding window VAD mode
    console.log("Starting whisper streaming with sliding window VAD mode");
    try {
      await this.context.startStreaming({
        language: language,
        contextId: 1, // Fixed context ID for now
      });
      console.log("Whisper streaming started successfully");
    } catch (error) {
      console.error("Error starting whisper streaming:", error);
      this._isRecording = false;
      
      // Clean up timeout if it exists
      if (this.noEventsTimeout) {
        clearTimeout(this.noEventsTimeout);
        this.noEventsTimeout = null;
      }
      
      // Clean up subscription if it exists
      if (this._unsubscribe) {
        try {
          this._unsubscribe();
        } catch (e) {
          console.error("Error cleaning up subscription:", e);
        }
        this._unsubscribe = null;
      }
      
      this.notifyListeners();
      throw error;
    }
  }

  async stopTranscription() {
    if (!this.context) {
      console.log("No whisper context, nothing to stop");
      return;
    }

    console.log("Stopping transcription");
    
    // Save current result before cleanup
    const finalResult = this._transcriptionResult;
    const language = this._recordingLanguage;
    
    // Clear the fallback timeout if it exists
    if (this.noEventsTimeout) {
      clearTimeout(this.noEventsTimeout);
      this.noEventsTimeout = null;
    }

    // Cleanup resources first
    if (this._unsubscribe) {
      try {
        this._unsubscribe();
        console.log("Unsubscribed from transcription events");
      } catch (error) {
        console.error("Error unsubscribing from transcription events:", error);
      }
      this._unsubscribe = null;
    }
    
    // Mark as not recording before calling stopStreaming to avoid race conditions
    this._isRecording = false;
    this.notifyListeners();

    try {
      // Stop streaming
      await this.context.stopStreaming({
        contextId: 1,  // Fixed context ID for now
      });
      console.log("Whisper streaming stopped successfully");
    } catch (error) {
      console.error("Error stopping whisper streaming:", error);
      // Continue with cleanup even if there's an error
    }

    // Call the completion callback with the final result
    console.log("Calling transcription complete callback with result:", finalResult);
    if (this._onTranscriptionCompleteCallback && finalResult.trim() !== "") {
      this._onTranscriptionCompleteCallback(finalResult, language);
    }
    
    this._transcriptionResult = "";
    this.notifyListeners();
  }

  getState(): TranscriptionServiceTurboState {
    return {
      modelExists: this._exists,
      modelName: this._modelName,
      modelSize: this._modelSize,
      isInitialized: this._isInitialized,
      whisperContext: this.context,
      transcriptionResult: this._transcriptionResult,
      isRecording: this._isRecording,
    };
  }

  private notifyListeners() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  subscribe(listener: (state: TranscriptionServiceTurboState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const transcriptionServiceTurbo = new TranscriptionServiceTurbo(); 