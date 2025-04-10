import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const LINKING_ERROR =
  `The package 'whisperkit-native' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const WhisperKitModule = NativeModules.WhisperKitModule
  ? NativeModules.WhisperKitModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

const eventEmitter = new NativeEventEmitter(WhisperKitModule);

/**
 * WhisperKit Native Module
 */
class WhisperKit {
  /**
   * Initialize WhisperKit with a specific model
   * @param {string} modelName - Name of the model to use (e.g. "large-v3")
   * @returns {Promise<boolean>} - True if initialization was successful
   */
  static initialize(modelName) {
    if (Platform.OS !== 'ios') {
      console.warn('WhisperKit is only available on iOS');
      return Promise.resolve(false);
    }
    return WhisperKitModule.initialize(modelName);
  }

  /**
   * Transcribe an audio file
   * @param {string} audioPath - Path to the audio file
   * @returns {Promise<Object>} - Transcription result
   */
  static transcribeFile(audioPath) {
    if (Platform.OS !== 'ios') {
      console.warn('WhisperKit is only available on iOS');
      return Promise.resolve({ text: '' });
    }
    return WhisperKitModule.transcribeFile(audioPath);
  }

  /**
   * Start streaming audio from microphone
   * @param {Function} callback - Callback for receiving transcription updates
   * @returns {Promise<boolean>} - True if streaming started successfully
   */
  static startStreaming(callback) {
    if (Platform.OS !== 'ios') {
      console.warn('WhisperKit is only available on iOS');
      return Promise.resolve(false);
    }
    
    // Add event listener
    const subscription = eventEmitter.addListener(
      'onTranscriptionUpdate',
      callback
    );
    
    // Store subscription for cleanup
    this._subscription = subscription;
    
    return WhisperKitModule.startStreaming();
  }

  /**
   * Stop streaming audio
   * @returns {Promise<boolean>} - True if streaming stopped successfully
   */
  static stopStreaming() {
    if (Platform.OS !== 'ios') {
      console.warn('WhisperKit is only available on iOS');
      return Promise.resolve(false);
    }
    
    // Remove event listener
    if (this._subscription) {
      this._subscription.remove();
      this._subscription = null;
    }
    
    return WhisperKitModule.stopStreaming();
  }
}

export default WhisperKit; 