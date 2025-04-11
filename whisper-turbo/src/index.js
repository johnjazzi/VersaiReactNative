import { NativeModules, Platform, DeviceEventEmitter } from 'react-native';

const LINKING_ERROR =
  `The package 'whisper-turbo' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const WhisperTurbo = NativeModules.WhisperTurbo
  ? NativeModules.WhisperTurbo
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

// Use DeviceEventEmitter instead of NativeEventEmitter to avoid iOS issues
const eventEmitter = DeviceEventEmitter;

/**
 * Constants for audio session categories (iOS only)
 */
export const AudioCategory = {
  Ambient: 'AVAudioSessionCategoryAmbient',
  SoloAmbient: 'AVAudioSessionCategorySoloAmbient',
  Playback: 'AVAudioSessionCategoryPlayback',
  Record: 'AVAudioSessionCategoryRecord',
  PlayAndRecord: 'AVAudioSessionCategoryPlayAndRecord',
  MultiRoute: 'AVAudioSessionCategoryMultiRoute',
};

/**
 * Constants for audio session category options (iOS only)
 */
export const AudioCategoryOption = {
  MixWithOthers: 'MixWithOthers',
  DuckOthers: 'DuckOthers',
  InterruptSpokenAudioAndMixWithOthers: 'InterruptSpokenAudioAndMixWithOthers',
  AllowBluetooth: 'AllowBluetooth',
  AllowBluetoothA2DP: 'AllowBluetoothA2DP',
  AllowAirPlay: 'AllowAirPlay',
  DefaultToSpeaker: 'DefaultToSpeaker',
};

/**
 * Constants for audio session modes (iOS only)
 */
export const AudioMode = {
  Default: 'AVAudioSessionModeDefault',
  VoiceChat: 'AVAudioSessionModeVoiceChat',
  VideoChat: 'AVAudioSessionModeVideoChat',
  GameChat: 'AVAudioSessionModeGameChat',
  VideoRecording: 'AVAudioSessionModeVideoRecording',
  Measurement: 'AVAudioSessionModeMeasurement',
  MoviePlayback: 'AVAudioSessionModeMoviePlayback',
  SpokenAudio: 'AVAudioSessionModeSpokenAudio',
};

/**
 * Whisper context for handling transcription
 */
export class WhisperContext {
  /**
   * @param {number} contextId - The native context ID
   */
  constructor(contextId) {
    this.contextId = contextId;
    this.isStreaming = false;
    this.listeners = [];
  }

  /**
   * Start streaming audio for transcription
   * @param {Object} options - Options for streaming
   * @returns {Promise<boolean>} - True if successful
   */
  async startStreaming(options = {}) {
    if (this.isStreaming) {
      return true;
    }

    // Remove existing listeners
    this.removeAllListeners();

    // Add new listener
    this.listener = eventEmitter.addListener(
      'onTranscriptionResult',
      (event) => {
        if (event.contextId === this.contextId) {
          this.listeners.forEach((callback) => {
            callback({
              text: event.text,
              progress: event.progress,
            });
          });
        }
      }
    );

    // Pass contextId in the options object instead of as a separate parameter
    const optionsWithContext = {
      ...options,
      contextId: this.contextId
    };
    const result = await WhisperTurbo.startStreaming(optionsWithContext);
    this.isStreaming = true;
    return result;
  }

  /**
   * Stop streaming audio
   * @param {Object} options - Options for stopping streaming
   * @returns {Promise<boolean>} - True if successful
   */
  async stopStreaming(options = {}) {
    if (!this.isStreaming) {
      return true;
    }

    try {
      // Ensure we pass the contextId in the options
      const optionsWithContext = {
        ...options,
        contextId: this.contextId
      };
      
      // First remove listeners to prevent any issues during shutdown
      this.removeAllListeners();
      
      const result = await WhisperTurbo.stopStreaming(optionsWithContext);
      this.isStreaming = false;
      return result;
    } catch (error) {
      console.error("Error stopping streaming:", error);
      // Even if there's an error, mark as not streaming
      this.isStreaming = false;
      // Make sure listeners are removed
      this.removeAllListeners();
      throw error;
    }
  }

  /**
   * Subscribe to transcription results
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Remove all listeners
   */
  removeAllListeners() {
    if (this.listener) {
      this.listener.remove();
      this.listener = null;
    }
    this.listeners = [];
  }

  /**
   * Free the native resources
   * @returns {Promise<boolean>} - True if successful
   */
  async release() {
    await this.stopStreaming();
    return WhisperTurbo.freeModel(this.contextId);
  }
}

/**
 * Initialize a new Whisper context
 * @param {string} modelPath - Path to the Whisper model file
 * @returns {Promise<WhisperContext>} - New Whisper context
 */
export async function initWhisper(modelPath) {
  const contextId = await WhisperTurbo.initializeModel(modelPath);
  return new WhisperContext(contextId);
}

/**
 * Audio session utilities for iOS
 */
export const AudioSession = {
  /**
   * Set the audio session category
   * @param {string} category - Audio session category
   * @param {string[]} options - Audio session category options
   * @returns {Promise<boolean>} - True if successful
   */
  setCategory: (category, options = []) => {
    if (Platform.OS !== 'ios') {
      return Promise.resolve(true);
    }
    return WhisperTurbo.setAudioSessionCategory(category, options);
  },

  /**
   * Set the audio session mode
   * @param {string} mode - Audio session mode
   * @returns {Promise<boolean>} - True if successful
   */
  setMode: (mode) => {
    if (Platform.OS !== 'ios') {
      return Promise.resolve(true);
    }
    return WhisperTurbo.setAudioSessionMode(mode);
  },

  /**
   * Set the audio session active state
   * @param {boolean} active - Whether to activate the audio session
   * @returns {Promise<boolean>} - True if successful
   */
  setActive: (active) => {
    if (Platform.OS !== 'ios') {
      return Promise.resolve(true);
    }
    return WhisperTurbo.setAudioSessionActive(active);
  },
};

/**
 * Get system information
 * @returns {Promise<Object>} - System information
 */
export function getSystemInfo() {
  return WhisperTurbo.getSystemInfo();
}

export default {
  initWhisper,
  AudioCategory,
  AudioCategoryOption,
  AudioMode,
  AudioSession,
  getSystemInfo,
}; 