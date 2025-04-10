import Foundation
import React

@objc(WhisperKitModule)
class WhisperKitModule: RCTEventEmitter {
  
  private var isInitialized = false
  private var hasListeners = false
  
  override init() {
    super.init()
  }
  
  override func startObserving() {
    hasListeners = true
  }
  
  override func stopObserving() {
    hasListeners = false
  }
  
  @objc
  func initialize(_ modelName: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    // TODO: Implement WhisperKit initialization
    // For now, we'll just mock the initialization to allow testing the integration
    DispatchQueue.main.async {
      self.isInitialized = true
      resolver(true)
    }
  }
  
  @objc
  func transcribeFile(_ audioPath: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    guard isInitialized else {
      rejecter("not_initialized", "WhisperKit is not initialized", nil)
      return
    }
    
    // TODO: Implement WhisperKit transcription
    // For now, we'll just return a mock result
    DispatchQueue.main.async {
      let mockResult: [String: Any] = [
        "text": "This is a mock transcription from WhisperKit native module.",
        "segments": [
          [
            "text": "This is a mock transcription",
            "start": 0.0,
            "end": 2.0
          ],
          [
            "text": "from WhisperKit native module.",
            "start": 2.0,
            "end": 4.0
          ]
        ]
      ]
      resolver(mockResult)
    }
  }
  
  @objc
  func startStreaming(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    guard isInitialized else {
      rejecter("not_initialized", "WhisperKit is not initialized", nil)
      return
    }
    
    // TODO: Implement WhisperKit streaming
    // For now, we'll just mock sending events
    DispatchQueue.main.async {
      resolver(true)
      
      // Mock sending a few events
      if self.hasListeners {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
          self.sendEvent(withName: "onTranscriptionUpdate", body: [
            "text": "This is a mock streaming transcription.",
            "isFinal": false
          ])
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
          self.sendEvent(withName: "onTranscriptionUpdate", body: [
            "text": "This is a mock streaming transcription. And it continues.",
            "isFinal": false
          ])
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
          self.sendEvent(withName: "onTranscriptionUpdate", body: [
            "text": "This is a mock streaming transcription. And it continues. Final version.",
            "isFinal": true
          ])
        }
      }
    }
  }
  
  @objc
  func stopStreaming(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    guard isInitialized else {
      rejecter("not_initialized", "WhisperKit is not initialized", nil)
      return
    }
    
    // TODO: Implement WhisperKit stop streaming
    DispatchQueue.main.async {
      resolver(true)
    }
  }
  
  @objc
  override static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  // For sending events back to JavaScript
  @objc
  override func supportedEvents() -> [String]! {
    return ["onTranscriptionUpdate"]
  }
} 