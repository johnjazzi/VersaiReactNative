#!/bin/bash

# This script downloads whisper.cpp repository and puts the required files in place

set -e

WHISPER_CPP_VERSION="v1.5.4"
TEMP_DIR="temp_whisper_cpp"

echo "Downloading whisper.cpp version ${WHISPER_CPP_VERSION}..."

# Create temporary directory
mkdir -p $TEMP_DIR
cd $TEMP_DIR

# Download source code
curl -L -o whisper.cpp.zip "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_CPP_VERSION}.zip"
unzip whisper.cpp.zip

# Create destination directories
mkdir -p ../cpp

# Copy necessary files
cp whisper.cpp-*/whisper.cpp ../cpp/
cp whisper.cpp-*/whisper.h ../cpp/
cp whisper.cpp-*/ggml.c ../cpp/
cp whisper.cpp-*/ggml.h ../cpp/
cp whisper.cpp-*/ggml-impl.h ../cpp/

cp -r whisper.cpp-*/examples/stream/stream.cpp ../cpp/
cp -r whisper.cpp-*/examples/common.h ../cpp/
cp -r whisper.cpp-*/examples/common.cpp ../cpp/

echo "Creating audio-utils.cpp based on stream.cpp..."

# Clean up
cd ..
rm -rf $TEMP_DIR

echo "whisper.cpp files downloaded and copied successfully!"
echo "You'll need to manually modify the C++ code to match our interface." 