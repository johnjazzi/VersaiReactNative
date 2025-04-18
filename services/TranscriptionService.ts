import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import { LANGUAGE_MAP, LanguageMapping } from "./Common";
import { initWhisper, WhisperContext, AudioSessionIos } from "whisper.rn";
import { TranslationServiceState } from "./TranslationService";
import { useEffect, useState, useRef } from "react";
import {unzip} from "react-native-zip-archive";
import RNFS from 'react-native-fs';
import { Audio } from "expo-av";


export interface TranscriptionServiceState {
  modelExists: boolean;
  modelName: string;
  modelSize: number;
  isInitialized: boolean;
  whisperContext: WhisperContext | null;
  transcriptionResult: string;
  isRecording: boolean;
  initError: string | null;
}

export function useTranscriptionService() {
  const [state, setState] = useState<TranscriptionServiceState>(() =>
    transcriptionService.getState(),
  );

  useEffect(() => {
    const unsubscribe = transcriptionService.subscribe(setState);
    return () => unsubscribe();
  }, []);

  return state;
}

const modelFiles = (modelName: string) => [
  {
    name: `${modelName}.bin`,
    modelUrl:
      `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelName}.bin`,
  },
  {
    name: `${modelName}.mlmodelc.zip`,
    modelUrl:
      `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelName}-encoder.mlmodelc.zip`,
  },
];

export class TranscriptionService {

  private _modelName: string = "ggml-small";
  private _exists: boolean = false;
  private _modelSize: number = 0;
  private _isInitialized: boolean = false;
  private context: WhisperContext | null = null;
  private _transcriptionResult: string = "";
  private _stopRecording: (() => void) | null = null;
  private _isRecording: boolean = false;
  private _recordingLanguage: string = "en";
  private _initError: string | null = null;
  private listeners: Set<(state: TranscriptionServiceState) => void> =
    new Set();
  private _onTranscriptionCompleteCallback:
    | ((text: string, language: string) => void)
    | null = null;

  setOnTranscriptionCompleteCallback(
    callback: ((text: string, language: string) => void) | null,
  ) {
    this._onTranscriptionCompleteCallback = callback;
  }

  async checkIfbundledModelExists() {
    try {
      if (this._modelName != "ggml-small") {
        throw new Error("bundled model not selected");
      }
      
      // Just use require directly for bundled assets
      const model = require(`../assets/models/ggml-small.bin`);
      const model_ml_weight = require(`../assets/models/ggml-small-encoder.mlmodelc/weights/weight.bin`);
      const model_ml_model = require(`../assets/models/ggml-small-encoder.mlmodelc/model.mil`);
      const model_ml_coremldata = require(`../assets/models/ggml-small-encoder.mlmodelc/coremldata.bin`);

      console.log('Models loaded from bundled assets');
      return {
        exists: true,
        model,
        model_ml_weight,
        model_ml_model,
        model_ml_coremldata
      };
    } catch (error) {
      console.log('Models not found in bundle, trying FileSystem');
      try {
        const basePath = Platform.OS === 'ios' ? 
        `${RNFS.DocumentDirectoryPath}/` : 
        `${RNFS.DocumentDirectoryPath}/`;
        const modelPath = `${basePath}${this._modelName}.bin`;
        const weightPath = `${basePath}${this._modelName}-encoder.mlmodelc/weights/weight.bin`;
        const modelMlPath = `${basePath}${this._modelName}-encoder.mlmodelc/model.mil`;
        const coremlPath = `${basePath}${this._modelName}-encoder.mlmodelc/coremldata.bin`;

        // For FileSystem, just return the URIs
        const [modelExists, weightExists, modelMlExists, coremlExists] = await Promise.all([
          RNFS.exists(modelPath),
          RNFS.exists(weightPath),
          RNFS.exists(modelMlPath),
          RNFS.exists(coremlPath)
        ]);

        if (!modelExists || !weightExists || !modelMlExists || !coremlExists) {
          throw new Error("Model files not found");
        }

        return {
          exists: true,
          model: modelPath,
          model_ml_weight: weightPath,
          model_ml_model: modelMlPath,
          model_ml_coremldata: coremlPath
        };

      } catch (secondError) {
        console.error("Error: No model found, please download the model", secondError);
        return {
          exists: false,
          model: null,
          model_ml_weight: null,
          model_ml_model: null,
          model_ml_coremldata: null
        };
      }
    }
  }

  async initialize(
    setLoadingStatus?: (status: string) => void,
    setLoadingProgress?: (progress: number) => void,
  ) {
    try {
      setLoadingStatus?.("Initializing Whisper model...");
      const {exists, model, model_ml_weight, model_ml_model, model_ml_coremldata} = await this.checkIfbundledModelExists()

      if (!exists) {
        this._initError = "Model not found";
        this.notifyListeners();
        throw new Error("Model not found");
      }
      this._modelSize = 0;
      this._exists = true;
      setLoadingProgress?.(10);

      try {
        this.context = await initWhisper({
          useFlashAttn: true,
          useGpu: true,
          useCoreMLIos: Platform.OS === 'ios' ? true : false,
          filePath: model,
          coreMLModelAsset:
            Platform.OS === "ios"
              ? {
                  filename: `${this._modelName}-encoder.mlmodelc`,
                  assets: [
                    model_ml_weight,
                    model_ml_model,
                    model_ml_coremldata
                  ],
                }
              : undefined,
        });

        console.log("Whisper context initialized");
        this._initError = null;
      } catch (whisperError) {
        console.error("Whisper initialization failed:", whisperError);
        // Try again with different options
        this.context = await initWhisper({
          useFlashAttn: false,
          useGpu: false,
          useCoreMLIos: false,
          filePath: model,
          coreMLModelAsset: undefined
        });
        console.log("Whisper context initialized with fallback options");
        this._initError = null;
      }

      setLoadingProgress?.(80);
      // The commented section below was causing issues
      // console.log("warming transcription context");
      // await new Promise((resolve) => setTimeout(resolve, 500));
      // const { stop, promise } = this.context.transcribe(
      //     require("../assets/jfk.wav"), {
      //     maxLen: 1,
      //     language: "en",
      //     maxThreads: 6,
      // });
      // const { result, segments } = await promise
      // console.log(result)
      // console.log("transcription context warmed up");

      setLoadingProgress?.(100);
      setLoadingStatus?.("Ready!");

      this._isInitialized = true;
      this.notifyListeners();
    } catch (error: any) {
      console.error("Detailed error:", error);
      this._initError = error.message || "Unknown initialization error";
      this.notifyListeners();
      setLoadingStatus?.("Error loading models: " + error.message);
    }
  }

  async downloadModel(
    onProgress: (progress: number) => void,
    setLoadingStatus: (status: string) => void,
  ): Promise<void> {
    try {
      // Download each model file sequentially
        const modelFile = modelFiles(this._modelName)[0]
        const filePath = `${RNFS.DocumentDirectoryPath}/${modelFile.name}`

        const result = await RNFS.downloadFile({
          fromUrl: modelFile.modelUrl,
          toFile: filePath,
          begin: () => {
            setLoadingStatus('Downloading model...');
            onProgress(0);
          },
          progress: (res) => {
            const progress = (res.bytesWritten / res.contentLength) * 100;
            onProgress(Math.round(progress));
            setLoadingStatus(
              `Downloading ${modelFile.name} ... ${Math.round(progress)}%`
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

        if (modelFile.name.endsWith(".zip") && Platform.OS === "ios") {
          onProgress(98)
          setLoadingStatus("Extracting model files...");
          await unzip(filePath, RNFS.DocumentDirectoryPath || "");
          console.log("Model files extracted successfully");
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
    try {
      setLoadingStatus("Deleting models...");

      // Delete main model file
      const mainModelPath = `${RNFS.DocumentDirectoryPath}${this._modelName}.bin`;
      const mainModelInfo = await FileSystem.getInfoAsync(mainModelPath);
      if (mainModelInfo.exists) {
        await FileSystem.deleteAsync(mainModelPath);
      }

      // Delete Core ML model directory if on iOS
      if (Platform.OS === "ios") {
        const coreMLDirPath = `${FileSystem.documentDirectory}${this._modelName}-encoder.mlmodelc`;
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

      setLoadingStatus("Models deleted successfully!");
    } catch (error: any) {
      console.error("Delete error:", error);
      setLoadingStatus("Error deleting models: " + error.message);
      throw error;
    }
  }

  async startTranscription(language: string = "en") {
    if (!this.context) {
      throw new Error("Whisper context not initialized");
    }

    if (this._isRecording) return;

    await Audio.requestPermissionsAsync();

    this._isRecording = true;
    this._recordingLanguage = language;
    this._transcriptionResult = "";
    this.notifyListeners();


    const { stop, subscribe } = await this.context.transcribeRealtime({
      language: language,
      maxThreads: 4,
      maxLen: 1,
      realtimeAudioSec: 30,
      realtimeAudioSliceSec: 25,
      audioSessionOnStartIos: {
        category: AudioSessionIos.Category.PlayAndRecord,
        options: [
          AudioSessionIos.CategoryOption.MixWithOthers,
          AudioSessionIos.CategoryOption.AllowBluetooth,
        ],
        mode: AudioSessionIos.Mode.Default,
      },
      audioSessionOnStopIos: "restore",
    });

    this._stopRecording = stop;

    subscribe((evt) => {
      const { isCapturing, data, processTime, recordingTime, error, code } = evt;


      if (data?.result) {

        console.log(processTime, recordingTime);

        if (this._isRecording ) {
          this._transcriptionResult = data.result;
          this.notifyListeners();
        } else {
          this._stopRecording?.();
        }
      }

      if (!isCapturing) {
        this._isRecording = false;
        
        //this._transcriptionResult = ""
        console.log("Finished realtime transcribing");
        this.notifyListeners();
      }
    });
  }

  async stopTranscription() {
    if (!this.context || !this._stopRecording) return;

    this._stopRecording();
    await new Promise((resolve) => setTimeout(resolve, 100)); //wait for any existing transcriptions to end

    this._isRecording = false;
    this._onTranscriptionCompleteCallback?.(
      this._transcriptionResult,
      this._recordingLanguage,
    );
    this._transcriptionResult = "";
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
      isRecording: this._isRecording,
      initError: this._initError
    };
  }

  private notifyListeners() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  subscribe(listener: (state: TranscriptionServiceState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const transcriptionService = new TranscriptionService();
