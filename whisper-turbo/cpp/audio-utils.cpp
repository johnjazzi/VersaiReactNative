#include "audio-utils.h"
#include <cmath>
#include <cstring>
#include <algorithm>

void convert_s16_to_float(const int16_t* input, float* output, int length) {
    const float scale = 1.0f / 32768.0f;
    for (int i = 0; i < length; i++) {
        output[i] = input[i] * scale;
    }
}

void apply_high_pass_filter(float* data, int length, float cutoff, float sample_rate) {
    const float rc = 1.0f / (2.0f * M_PI * cutoff);
    const float dt = 1.0f / sample_rate;
    const float alpha = dt / (rc + dt);
    
    float y = data[0];
    
    for (int i = 1; i < length; i++) {
        y = alpha * (y + data[i] - data[i-1]);
        data[i] = y;
    }
}

bool detect_voice_activity(
    const float* samples, 
    int length, 
    float threshold, 
    float frequency_threshold
) {
    if (length <= 0) {
        return false;
    }
    
    // Copy samples because we'll modify them
    std::vector<float> pcmf32(samples, samples + length);
    
    // Apply high-pass filter if frequency threshold is specified
    if (frequency_threshold > 0.0f) {
        apply_high_pass_filter(pcmf32.data(), length, frequency_threshold, 16000);
    }
    
    // Calculate energy
    float energy_total = 0.0f;
    
    for (int i = 0; i < length; i++) {
        energy_total += fabsf(pcmf32[i]);
    }
    
    energy_total /= length;
    
    // Calculate energy in the last portion
    const int last_ms = 500; // last 500ms
    const int n_samples_last = (16000 * last_ms) / 1000;
    
    if (n_samples_last >= length) {
        return false; // Not enough samples
    }
    
    float energy_last = 0.0f;
    for (int i = length - n_samples_last; i < length; i++) {
        energy_last += fabsf(pcmf32[i]);
    }
    energy_last /= n_samples_last;
    
    // If last portion energy exceeds threshold * total energy, we have voice
    return energy_last <= threshold * energy_total;
}

AudioRingBuffer::AudioRingBuffer(int capacity) : 
    buffer(capacity, 0.0f), write_pos(0), filled(0) {}

void AudioRingBuffer::add(const float* samples, int length) {
    if (length <= 0) return;
    
    // Ensure we don't exceed capacity
    length = std::min(length, (int)buffer.size());
    
    // First part: from write_pos to end of buffer
    int first_part = std::min(length, (int)buffer.size() - write_pos);
    if (first_part > 0) {
        std::memcpy(buffer.data() + write_pos, samples, first_part * sizeof(float));
        write_pos = (write_pos + first_part) % buffer.size();
    }
    
    // Second part: from beginning of buffer
    int second_part = length - first_part;
    if (second_part > 0) {
        std::memcpy(buffer.data(), samples + first_part, second_part * sizeof(float));
        write_pos = second_part;
    }
    
    // Update filled count
    filled = std::min((int)buffer.size(), filled + length);
}

std::vector<float> AudioRingBuffer::get_last_samples(int n) {
    std::vector<float> result(n, 0.0f);
    
    // Can't return more than we have
    n = std::min(n, filled);
    if (n <= 0) return result;
    
    // Calculate start position
    int start_pos = (write_pos - n + buffer.size()) % buffer.size();
    
    // First part: from start_pos to end of buffer
    int first_part = std::min(n, (int)buffer.size() - start_pos);
    if (first_part > 0) {
        std::memcpy(result.data(), buffer.data() + start_pos, first_part * sizeof(float));
    }
    
    // Second part: from beginning of buffer
    int second_part = n - first_part;
    if (second_part > 0) {
        std::memcpy(result.data() + first_part, buffer.data(), second_part * sizeof(float));
    }
    
    return result;
}

float* AudioRingBuffer::get_write_buffer(int length) {
    if (length <= 0 || length > (int)buffer.size()) return nullptr;
    
    // Return a pointer to write to, simpler implementation just returns current position
    return buffer.data() + write_pos;
}

void AudioRingBuffer::commit_write(int length) {
    if (length <= 0) return;
    
    // Update write position
    write_pos = (write_pos + length) % buffer.size();
    
    // Update filled count
    filled = std::min((int)buffer.size(), filled + length);
}

void AudioRingBuffer::clear() {
    std::fill(buffer.begin(), buffer.end(), 0.0f);
    write_pos = 0;
    filled = 0;
}

int AudioRingBuffer::size() const {
    return filled;
}

int AudioRingBuffer::capacity() const {
    return buffer.size();
} 