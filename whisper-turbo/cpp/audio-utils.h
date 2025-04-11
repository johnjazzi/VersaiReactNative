#ifndef AUDIO_UTILS_H
#define AUDIO_UTILS_H

#include <cstdint>
#include <vector>
#include <string>

// Convert audio samples from 16-bit PCM to 32-bit float
void convert_s16_to_float(const int16_t* input, float* output, int length);

// Apply a high-pass filter to audio data to remove low frequency noise
void apply_high_pass_filter(float* data, int length, float cutoff, float sample_rate);

// Simple voice activity detection to determine if audio contains speech
bool detect_voice_activity(
    const float* samples, 
    int length, 
    float threshold = 0.6f, 
    float frequency_threshold = 100.0f);

// Ring buffer for audio processing
class AudioRingBuffer {
public:
    AudioRingBuffer(int capacity);
    
    // Add samples to the buffer
    void add(const float* samples, int length);
    
    // Get the last N samples (or as many as available) as a continuous array
    std::vector<float> get_last_samples(int n);
    
    // Get buffer for direct writing (returns pointer to write position)
    float* get_write_buffer(int length);
    
    // Commit write operation (advance write pointer)
    void commit_write(int length);
    
    // Clear the buffer
    void clear();
    
    // Get the number of samples in the buffer
    int size() const;
    
    // Get the capacity of the buffer
    int capacity() const;

private:
    std::vector<float> buffer;
    int write_pos;
    int filled;
};

#endif // AUDIO_UTILS_H 