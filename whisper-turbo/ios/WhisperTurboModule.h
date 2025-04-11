#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <AudioToolbox/AudioToolbox.h>
#import <AVFoundation/AVFoundation.h>

@interface WhisperTurboModule : RCTEventEmitter <RCTBridgeModule>

// Forward transcription results method
- (bool)forwardTranscriptionResult:(const char*)text progress:(float)progress;

// Initialize the whisper model with a path to the model file
- (void)initializeModel:(NSString *)modelPath
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject;

// Start streaming transcription
- (void)startStreaming:(NSDictionary *)options
              resolver:(RCTPromiseResolveBlock)resolve
              rejecter:(RCTPromiseRejectBlock)reject;

// Stop streaming
- (void)stopStreaming:(RCTPromiseResolveBlock)resolve
             rejecter:(RCTPromiseRejectBlock)reject;

// Free the model
- (void)freeModel:(RCTPromiseResolveBlock)resolve
         rejecter:(RCTPromiseRejectBlock)reject;

// Audio session configuration
- (void)setAudioSessionCategory:(NSString *)category
                        options:(NSArray *)options
                       resolver:(RCTPromiseResolveBlock)resolve
                       rejecter:(RCTPromiseRejectBlock)reject;

- (void)setAudioSessionMode:(NSString *)mode
                   resolver:(RCTPromiseResolveBlock)resolve
                   rejecter:(RCTPromiseRejectBlock)reject;

- (void)setAudioSessionActive:(BOOL)active
                     resolver:(RCTPromiseResolveBlock)resolve
                     rejecter:(RCTPromiseRejectBlock)reject;

// Get system info (CPU features etc.)
- (void)getSystemInfo:(RCTPromiseResolveBlock)resolve
             rejecter:(RCTPromiseRejectBlock)reject;

@end 