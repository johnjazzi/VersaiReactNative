#ifndef WHISPER_H
#define WHISPER_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

//
// C interface
//

#define WHISPER_SAMPLE_RATE 16000
#define WHISPER_SAMPLE_SIZE sizeof(float)
#define WHISPER_N_FFT       400
#define WHISPER_N_MEL       80
#define WHISPER_HOP_LENGTH  160
#define WHISPER_CHUNK_SIZE  30

struct whisper_context;
struct whisper_state;
struct whisper_full_params;

typedef struct whisper_context whisper_context;
typedef struct whisper_state whisper_state;
typedef struct whisper_full_params whisper_full_params;

typedef int whisper_token;

// Various functions for loading a whisper model from a file or buffer
whisper_context * whisper_init_from_file(const char * path_model);

// Clean up the model memory
void whisper_free(whisper_context * ctx);

// Stream callback function - return true to stop
typedef bool (*whisper_stream_callback)(void * user_data, const char * text, float progress);

// Parameters for streaming inference
struct whisper_stream_params {
    // Audio buffer parameters
    int buffer_size_ms;   // Buffer size in milliseconds
    int step_size_ms;     // Step size in milliseconds
    
    // Whisper parameters
    int n_threads;        // Number of threads to use
    bool translate;       // Translate to English
    const char * language; // Language of the audio (NULL for auto-detect)
    
    // VAD parameters
    bool use_vad;         // Use voice activity detection
    float vad_threshold;  // VAD threshold (0.0 - 1.0)
    
    // Callback
    whisper_stream_callback callback;
    void * callback_user_data;
};

typedef struct whisper_stream_params whisper_stream_params;

// Initialize stream parameters to default values
void whisper_stream_params_init(whisper_stream_params * params);

// Streaming inference
int whisper_stream_inference(
        whisper_context * ctx,
        const whisper_stream_params * params,
        const float * samples,
        int n_samples);

#ifdef __cplusplus
}
#endif

#endif // WHISPER_H 