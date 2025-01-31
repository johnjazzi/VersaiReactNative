
generating the models
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





```
yarn install
cd ios
pod install
cd ..
```

```
npx expo prebuild
yarn ios #need to run this and do a full build for whisper to work
```