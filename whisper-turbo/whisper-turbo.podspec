require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "whisper-turbo"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "12.0", :tvos => "12.0" }
  s.source       = { :git => "https://github.com/yourusername/whisper-turbo.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm}", "cpp/**/*.{h,cpp}"

  # Additional compiler flags for optimization
  s.compiler_flags = "-DNDEBUG -O3 -ffast-math -DWHISPER_USE_ACCELERATE -DUSE_ACCELERATE=1"

  # Link with system frameworks
  s.frameworks = "Accelerate", "AVFoundation", "AudioToolbox"

  # Pod dependencies
  s.dependency "React-Core"
  s.dependency "React"

  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => "\"$(PODS_TARGET_SRCROOT)/cpp\"",
    "OTHER_CFLAGS" => "-O3 -ffast-math -fvisibility=hidden -fvisibility-inlines-hidden -DNDEBUG",
    "OTHER_CPLUSPLUSFLAGS" => "-O3 -ffast-math -fvisibility=hidden -fvisibility-inlines-hidden -DNDEBUG",
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
  }
end 