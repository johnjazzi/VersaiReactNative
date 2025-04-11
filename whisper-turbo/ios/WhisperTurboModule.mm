#import "WhisperTurboModule.h"
#import <React/RCTConvert.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTUtils.h>
#import <React/RCTBridge.h>
#import <React/RCTEventDispatcher.h>

#include "../cpp/whisper.h"
#include "../cpp/audio-utils.h"

#define DEFAULT_BUFFER_SIZE_MS 5000
#define DEFAULT_STEP_SIZE_MS 500
#define DEFAULT_N_THREADS 1
#define DEFAULT_VAD_THRESHOLD 0.6f

// Audio queue recording structure
typedef struct {
    AudioQueueRef queue;
    AudioQueueBufferRef buffers[3];
    AudioStreamBasicDescription dataFormat;
    bool isRecording;
    bool isProcessing;
    void* userContext;
} RecordingState;

// C-style callback forwarding
bool transcriptionCallback(void* user_data, const char* text, float progress) {
    WhisperTurboModule* module = (__bridge WhisperTurboModule*)user_data;
    NSLog(@"Transcription callback called with text: %s, progress: %f", text, progress);
    return [module forwardTranscriptionResult:text progress:progress];
}

@interface WhisperTurboModule()
@property (nonatomic, assign) whisper_context* ctx;
@property (nonatomic, assign) RecordingState recordState;
@property (nonatomic, assign) AudioRingBuffer* audioBuffer;
@property (nonatomic, assign) BOOL isStreaming;
@property (nonatomic, assign) BOOL hasListeners;
@end

@implementation WhisperTurboModule {
    dispatch_queue_t _processingQueue;
}

RCT_EXPORT_MODULE(WhisperTurbo);

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

- (instancetype)init {
    if (self = [super init]) {
        _ctx = NULL;
        _isStreaming = NO;
        _hasListeners = NO;
        _processingQueue = dispatch_queue_create("com.whisperturbo.processing", DISPATCH_QUEUE_SERIAL);
        _audioBuffer = new AudioRingBuffer(WHISPER_SAMPLE_RATE * 30); // 30 seconds
    }
    return self;
}

- (void)dealloc {
    [self cleanupResources];
    delete _audioBuffer;
}

- (void)cleanupResources {
    if (_ctx != NULL) {
        whisper_free(_ctx);
        _ctx = NULL;
    }
    
    if (_recordState.isRecording) {
        AudioQueueStop(_recordState.queue, true);
        for (int i = 0; i < 3; i++) {
            AudioQueueFreeBuffer(_recordState.queue, _recordState.buffers[i]);
        }
        AudioQueueDispose(_recordState.queue, true);
        memset(&_recordState, 0, sizeof(_recordState));  // Reset the struct
    }
}

// Audio queue callback function
static void AudioInputCallback(void* inUserData, 
                               AudioQueueRef inAQ,
                               AudioQueueBufferRef inBuffer,
                               const AudioTimeStamp* inStartTime,
                               UInt32 inNumberPacketDescriptions,
                               const AudioStreamPacketDescription* inPacketDescs) {
    // Get recording state
    RecordingState* recordState = (RecordingState*)inUserData;
    WhisperTurboModule* module = (__bridge WhisperTurboModule*)recordState->userContext;
    
    if (!recordState->isRecording) {
        return;
    }
    
    // Process the audio data
    const int16_t* pcm = (const int16_t*)inBuffer->mAudioData;
    int pcmLength = inBuffer->mAudioDataByteSize / sizeof(int16_t);
    
    // Convert to float
    float* pcmf32 = (float*)malloc(pcmLength * sizeof(float));
    convert_s16_to_float(pcm, pcmf32, pcmLength);
    
    // Add to buffer
    [module addAudioData:pcmf32 length:pcmLength];
    
    // Process audio if not already processing
    if (!recordState->isProcessing) {
        recordState->isProcessing = true;
        dispatch_async(module->_processingQueue, ^{
            [module processAudioBuffer];
            recordState->isProcessing = false;
        });
    }
    
    // Free memory
    free(pcmf32);
    
    // Enqueue the buffer again
    if (recordState->isRecording) {
        AudioQueueEnqueueBuffer(inAQ, inBuffer, 0, NULL);
    }
}

- (void)addAudioData:(float*)data length:(int)length {
    if (_audioBuffer) {
        _audioBuffer->add(data, length);
    }
}

- (void)processAudioBuffer {
    if (!_isStreaming || !_ctx || !_audioBuffer) {
        return;
    }
    
    // Get last 30 seconds of audio (like in the example)
    int samplesNeeded = WHISPER_SAMPLE_RATE * 30; // 30 seconds window
    std::vector<float> audioData = _audioBuffer->get_last_samples(samplesNeeded);
    
    NSLog(@"Processing audio buffer with %lu samples", audioData.size());
    
    if (audioData.size() < WHISPER_SAMPLE_RATE * 0.5) {
        // Need at least 0.5 sec of audio
        NSLog(@"Not enough audio data for processing");
        return;
    }
    
    // Check for voice activity with the VAD threshold from example (0.6)
    float vadThreshold = 0.6f;
    if (detect_voice_activity(audioData.data(), (int)audioData.size(), vadThreshold, 100.0f)) {
        NSLog(@"Voice activity detected, running inference");
        
        // Set up parameters for sliding window mode
        whisper_stream_params params;
        whisper_stream_params_init(&params);
        
        params.buffer_size_ms = 30000; // 30 seconds like in example
        params.step_size_ms = 0;       // 0 for sliding window mode
        params.n_threads = 6;          // 6 threads like in example
        params.use_vad = true;
        params.vad_threshold = vadThreshold;
        params.callback = transcriptionCallback;
        params.callback_user_data = (__bridge void*)self;
        
        // Run inference
        NSLog(@"Running whisper stream inference");
        whisper_stream_inference(_ctx, &params, audioData.data(), (int)audioData.size());
    } else {
        NSLog(@"No voice activity detected");
    }
}

- (bool)forwardTranscriptionResult:(const char*)text progress:(float)progress {
    NSLog(@"forwardTranscriptionResult called with text: %s, progress: %f", text, progress);
    
    NSString* nsText = [NSString stringWithUTF8String:text ?: ""];
    
    // Use meaningful text only
    if (nsText.length > 0) {
        NSLog(@"Sending transcription result to JS: %@", nsText);
        
        // Send event using React Native's event system - must be on main thread
        dispatch_async(dispatch_get_main_queue(), ^{
            if (self.hasListeners) {
                [self sendEventWithName:@"onTranscriptionResult" body:@{
                    @"contextId": @(1), // We're using a fixed contextId for now
                    @"text": nsText,
                    @"progress": @(progress)
                }];
                NSLog(@"Event sent to JS");
            } else {
                NSLog(@"No listeners registered for events");
            }
        });
    } else {
        NSLog(@"Empty transcription result, not sending event");
    }
    
    // Return false to continue processing
    return false;
}

// Will be called when this module's first listener is added.
- (void)startObserving {
    self.hasListeners = YES;
    NSLog(@"WhisperTurboModule: Started observing");
}

// Will be called when this module's last listener is removed.
- (void)stopObserving {
    self.hasListeners = NO;
    NSLog(@"WhisperTurboModule: Stopped observing");
}

- (NSArray<NSString *> *)supportedEvents {
    return @[@"onTranscriptionResult"];
}

#pragma mark - React Native Methods

RCT_EXPORT_METHOD(initializeModel:(NSString *)modelPath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    WhisperTurboModule* weakSelf = self;
    dispatch_async(_processingQueue, ^{
        WhisperTurboModule* strongSelf = weakSelf;
        if (!strongSelf) return;
        
        // Clear previous context if exists
        if (strongSelf.ctx != NULL) {
            whisper_free(strongSelf.ctx);
            strongSelf.ctx = NULL;
        }
        
        // Initialize new context
        strongSelf.ctx = whisper_init_from_file([modelPath UTF8String]);
        
        if (strongSelf.ctx == NULL) {
            reject(@"init_failed", @"Failed to initialize whisper model", nil);
            return;
        }
        
        resolve(@YES);
    });
}

RCT_EXPORT_METHOD(startStreaming:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    WhisperTurboModule* weakSelf = self;
    dispatch_async(_processingQueue, ^{
        WhisperTurboModule* strongSelf = weakSelf;
        if (!strongSelf) return;
        
        // Extract contextId from options
        NSNumber *contextIdNum = options[@"contextId"];
        if (!contextIdNum) {
            reject(@"invalid_arguments", @"Missing contextId in options", nil);
            return;
        }
        
        // Extract language from options
        NSString *language = options[@"language"];
        NSLog(@"Starting transcription with language: %@", language ? language : @"auto");
        
        if (strongSelf.ctx == NULL) {
            reject(@"not_initialized", @"Whisper model not initialized", nil);
            return;
        }
        
        if (strongSelf.isStreaming) {
            resolve(@YES); // Already streaming
            return;
        }
        
        // Set up audio format
        RecordingState state = {0};
        state.dataFormat.mSampleRate = WHISPER_SAMPLE_RATE;
        state.dataFormat.mFormatID = kAudioFormatLinearPCM;
        state.dataFormat.mFormatFlags = kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked;
        state.dataFormat.mBytesPerPacket = 2;
        state.dataFormat.mFramesPerPacket = 1;
        state.dataFormat.mBytesPerFrame = 2;
        state.dataFormat.mChannelsPerFrame = 1;
        state.dataFormat.mBitsPerChannel = 16;
        
        state.isRecording = false;
        state.isProcessing = false;
        state.userContext = (__bridge void*)strongSelf;
        
        // Copy state to recordState property
        memcpy(&strongSelf->_recordState, &state, sizeof(state));
        
        NSLog(@"Setting up audio queue");
        // Set up audio queue
        OSStatus status = AudioQueueNewInput(&strongSelf->_recordState.dataFormat, 
                                             AudioInputCallback,
                                             &strongSelf->_recordState,
                                             NULL, 
                                             NULL,
                                             0,
                                             &strongSelf->_recordState.queue);
        
        if (status != noErr) {
            NSLog(@"Failed to initialize audio input: %d", (int)status);
            reject(@"audio_init_failed", 
                   [NSString stringWithFormat:@"Failed to initialize audio input: %d", (int)status], 
                   nil);
            return;
        }
        
        NSLog(@"Allocating audio buffers");
        // Allocate buffers
        for (int i = 0; i < 3; i++) {
            AudioQueueAllocateBuffer(strongSelf->_recordState.queue, 4096, &strongSelf->_recordState.buffers[i]);
            AudioQueueEnqueueBuffer(strongSelf->_recordState.queue, strongSelf->_recordState.buffers[i], 0, NULL);
        }
        
        NSLog(@"Starting audio queue");
        // Start recording
        status = AudioQueueStart(strongSelf->_recordState.queue, NULL);
        if (status != noErr) {
            NSLog(@"Failed to start audio recording: %d", (int)status);
            reject(@"audio_start_failed", 
                   [NSString stringWithFormat:@"Failed to start audio recording: %d", (int)status], 
                   nil);
            return;
        }
        
        // Clear buffer
        if (strongSelf.audioBuffer) {
            strongSelf.audioBuffer->clear();
        }
        
        // Update state
        strongSelf->_recordState.isRecording = true;
        strongSelf.isStreaming = YES;
        
        // Start processing audio in a loop
        dispatch_async(strongSelf->_processingQueue, ^{
            // Process audio every 100ms while streaming for more responsive detection
            NSLog(@"Starting audio processing loop with sliding window VAD");
            int iterations = 0;
            while (strongSelf.isStreaming) {
                [strongSelf processAudioBuffer];
                if (++iterations % 10 == 0) {
                    NSLog(@"Audio processing iteration %d", iterations);
                }
                usleep(100000); // 100ms
            }
        });
        
        resolve(@YES);
    });
}

RCT_EXPORT_METHOD(stopStreaming:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    WhisperTurboModule* weakSelf = self;
    dispatch_async(_processingQueue, ^{
        WhisperTurboModule* strongSelf = weakSelf;
        if (!strongSelf) return;
        
        // Extract contextId from options
        NSNumber *contextIdNum = options[@"contextId"];
        if (!contextIdNum) {
            reject(@"invalid_arguments", @"Missing contextId in options", nil);
            return;
        }
        
        NSLog(@"Stopping streaming with contextId: %@", contextIdNum);
        
        if (!strongSelf.isStreaming) {
            NSLog(@"Not streaming, nothing to stop");
            resolve(@YES); // Not streaming
            return;
        }
        
        NSLog(@"Stopping audio queue");
        // Stop recording
        if (strongSelf->_recordState.isRecording) {
            AudioQueueStop(strongSelf->_recordState.queue, true);
            for (int i = 0; i < 3; i++) {
                AudioQueueFreeBuffer(strongSelf->_recordState.queue, strongSelf->_recordState.buffers[i]);
            }
            AudioQueueDispose(strongSelf->_recordState.queue, true);
            strongSelf->_recordState.isRecording = false;
            NSLog(@"Audio queue stopped and resources cleaned up");
        }
        
        // Send a final empty result to signal end of transcription
        dispatch_async(dispatch_get_main_queue(), ^{
            if (strongSelf.hasListeners) {
                [strongSelf sendEventWithName:@"onTranscriptionResult" body:@{
                    @"contextId": contextIdNum,
                    @"text": @"", // Empty text to signal end
                    @"progress": @(1.0f)
                }];
                NSLog(@"Final event sent to JS");
            } else {
                NSLog(@"No listeners registered for events");
            }
        });
        
        NSLog(@"Setting streaming state to NO");
        strongSelf.isStreaming = NO;
        resolve(@YES);
    });
}

RCT_EXPORT_METHOD(freeModel:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    dispatch_async(_processingQueue, ^{
        [self cleanupResources];
        resolve(@YES);
    });
}

RCT_EXPORT_METHOD(setAudioSessionCategory:(NSString *)category
                  options:(NSArray *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSError *error = nil;
    AVAudioSessionCategoryOptions optionsValue = 0;
    
    for (NSString *option in options) {
        if ([option isEqualToString:@"MixWithOthers"]) {
            optionsValue |= AVAudioSessionCategoryOptionMixWithOthers;
        } else if ([option isEqualToString:@"DuckOthers"]) {
            optionsValue |= AVAudioSessionCategoryOptionDuckOthers;
        } else if ([option isEqualToString:@"AllowBluetooth"]) {
            optionsValue |= AVAudioSessionCategoryOptionAllowBluetooth;
        } else if ([option isEqualToString:@"DefaultToSpeaker"]) {
            optionsValue |= AVAudioSessionCategoryOptionDefaultToSpeaker;
        }
    }
    
    [[AVAudioSession sharedInstance] setCategory:category withOptions:optionsValue error:&error];
    
    if (error) {
        reject(@"audio_session_error", @"Failed to set audio session category", error);
    } else {
        resolve(@YES);
    }
}

RCT_EXPORT_METHOD(setAudioSessionMode:(NSString *)mode
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSError *error = nil;
    [[AVAudioSession sharedInstance] setMode:mode error:&error];
    
    if (error) {
        reject(@"audio_session_error", @"Failed to set audio session mode", error);
    } else {
        resolve(@YES);
    }
}

RCT_EXPORT_METHOD(setAudioSessionActive:(BOOL)active
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSError *error = nil;
    [[AVAudioSession sharedInstance] setActive:active error:&error];
    
    if (error) {
        reject(@"audio_session_error", @"Failed to set audio session active state", error);
    } else {
        resolve(@YES);
    }
}

RCT_EXPORT_METHOD(getSystemInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    // This will need to be implemented after we implement the system_info function in C++
    resolve(@{@"info": @"System info not implemented yet"});
}

@end 