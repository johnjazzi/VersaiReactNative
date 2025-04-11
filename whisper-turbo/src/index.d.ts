export interface TranscriptionResult {
  text: string;
  progress: number;
}

export class WhisperContext {
  contextId: number;
  isStreaming: boolean;

  constructor(contextId: number);

  startStreaming(options?: {
    language?: string;
    contextId?: number;
    [key: string]: any;
  }): Promise<boolean>;

  stopStreaming(options?: {
    contextId?: number;
    [key: string]: any;
  }): Promise<boolean>;

  subscribe(callback: (result: TranscriptionResult) => void): () => void;

  removeAllListeners(): void;

  release(): Promise<boolean>;
}

export function initWhisper(modelPath: string): Promise<WhisperContext>;

export const AudioCategory: {
  Ambient: string;
  SoloAmbient: string;
  Playback: string;
  Record: string;
  PlayAndRecord: string;
  MultiRoute: string;
};

export const AudioCategoryOption: {
  MixWithOthers: string;
  DuckOthers: string;
  InterruptSpokenAudioAndMixWithOthers: string;
  AllowBluetooth: string;
  AllowBluetoothA2DP: string;
  AllowAirPlay: string;
  DefaultToSpeaker: string;
};

export const AudioMode: {
  Default: string;
  VoiceChat: string;
  VideoChat: string;
  GameChat: string;
  VideoRecording: string;
  Measurement: string;
  MoviePlayback: string;
  SpokenAudio: string;
};

export const AudioSession: {
  setCategory(category: string, options?: string[]): Promise<boolean>;
  setMode(mode: string): Promise<boolean>;
  setActive(active: boolean): Promise<boolean>;
};

export function getSystemInfo(): Promise<{
  info: string;
  [key: string]: any;
}>;

declare const _default: {
  initWhisper: typeof initWhisper;
  AudioCategory: typeof AudioCategory;
  AudioCategoryOption: typeof AudioCategoryOption;
  AudioMode: typeof AudioMode;
  AudioSession: typeof AudioSession;
  getSystemInfo: typeof getSystemInfo;
};

export default _default; 