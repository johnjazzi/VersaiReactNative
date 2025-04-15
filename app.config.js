const config = {
  expo: {
    name: "VersaiReactNative",
    slug: "VersaiReactNative",
    version: "1.0.0",
    jsEngine: "hermes",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: false,
    splash: {
      image: "./assets/icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: [
      "assets/models/*",
      "assets/*",
      "**/*.gguf",
      "**/*.bin"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.versai.VersaiReactNative",
      buildNumber: "1.0.0",
      developmentTeam: "HHMGH49F4L",
      icon: "./assets/icon.png",
      splash: {
        image: "./assets/icon.png",
        backgroundColor: "#ffffff"
      },
      infoPlist: {
        NSMicrophoneUsageDescription: "This app needs access to the microphone to record audio.",
        NSSpeechRecognitionUsageDescription: "This app needs access to speech recognition to translate text",
        UIFileSharingEnabled: true,
        LSSupportsOpeningDocumentsInPlace: true,
        ITSAppUsesNonExemptEncryption: false
      },
      deploymentTarget: "16.0",
      // Added to ensure better compatibility with EAS builds
      excludeXcodeProject: false,
      entitlements: {
        "com.apple.security.application-groups": [
          "group.com.versai.VersaiReactNative"
        ]
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.anonymous.VersaiReactNative",
      permissions: [
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE"
      ]
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      [
        "expo-av",
        {
          microphonePermission: "Allow VersAI to access your microphone."
        }
      ],
      [
        "expo-build-properties",
        {
          ios: {
            newArchEnabled: false,
            deploymentTarget: "16.0",
            // Added to ensure compatibility with native modules
            useFrameworks: "static"
          },
          android: {
            newArchEnabled: false
          }
        }
      ]
    ],
    extra: {
      eas: {
        projectId: "7b2b321f-3a8e-4724-a3a6-1a4303c9b43c"
      }
    }
  }
};

module.exports = config;
