
generating the whispermodels
```
cd ..
git clone https://github.com/ggerganov/whisper.cpp.git

# setup venv for coreml conversion
cd whisper.cpp
python3.10 -m venv venv
source venv/bin/activate
pip install "numpy<2"
pip install ane_transformers
pip install torch==2.1.0
pip install openai-whisper
pip install coremltools

# convert models
sh ./models/download-ggml-model.sh base
./models/generate-coreml-model.sh base
```


### Install modules

```
yarn install
```

### TO RUN ON DEVICE IN DEV MODE
```
npx expo prebuild --clean
npx expo run:ios --device
```

### TO RUN ON DEVICE IN RELEASE MODE
```
npx expo prebuild --clean
npx expo run:ios --device --configuration Release
```

might need to run in tunnel mode
```
npx expo start --tunnel
```


### DEBUG

llama.cpp install
```
git clone https://github.com/ggerganov/llama.cpp.git && cd llama.cpp && make

mkdir build && cd build && cmake .. && cmake --build . --config Release

```


testing model with llama.cpp
```
cd build && ./bin/llama-cli -m "/Users/johnazzinaro/Library/Developer/CoreSimulator/Devices/6C13621E-8E1F-428B-AA25-F86E6C4406F3/data/Containers/Data/Application/0A0542B6-6C25-4C49-A713-7EB9810ECB80/Documents/microsoft_Phi-4-mini-instruct-Q4_K_M.gguf" -p "Translate this to Portuguese: Hello, how are you?" --temp 0.7 --repeat-penalty 1.1
```
