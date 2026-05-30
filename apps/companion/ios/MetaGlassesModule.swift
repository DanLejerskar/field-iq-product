// MetaGlassesModule.swift
//
// React Native bridge wrapping the Meta Wearables Device Access Toolkit for iOS.
// See https://github.com/facebook/meta-wearables-dat-ios.
//
// The DAT SDK is added via CocoaPods (`pod 'MetaWearablesDAT'`) after `expo
// prebuild` on a Mac. Until then the methods short-circuit to deterministic
// responses so the JS layer can still exercise the flow.
//
// TODO(meta-sdk-link):
//   1. Add `pod 'MetaWearablesDAT'` to the generated Podfile or vendor the
//      framework into ios/Frameworks/MetaWearablesDAT.xcframework.
//   2. Replace the stub bodies below with calls into `MetaWearables.DeviceManager`
//      and `MetaWearables.Camera` (see https://wearables.developer.meta.com/docs).
//   3. Forward connection-status changes through the JS event emitter
//      (`MetaGlasses.connection`).

import Foundation
import React
// import MetaWearablesDAT  // uncomment after `pod install`

@objc(MetaGlasses)
class MetaGlasses: RCTEventEmitter {

  private var listenerCount = 0
  // private var deviceManager: MWDeviceManager?  // uncomment once SDK is linked.

  override static func requiresMainQueueSetup() -> Bool { false }
  override func supportedEvents() -> [String]! { ["MetaGlasses.connection"] }

  override func startObserving() { listenerCount += 1 }
  override func stopObserving()  { listenerCount = max(0, listenerCount - 1) }

  @objc func pairDevice(_ resolve: @escaping RCTPromiseResolveBlock,
                        reject: @escaping RCTPromiseRejectBlock) {
    // TODO(meta-sdk-link): deviceManager?.pair { result in ... }
    sendEvent(withName: "MetaGlasses.connection", body: "connecting")
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
      self.sendEvent(withName: "MetaGlasses.connection", body: "paired")
      resolve([
        "id": UUID().uuidString,
        "serial": "RAYBAN-DISPLAY-DEV",
        "model": "meta-ray-ban-display",
        "batteryPercent": 92
      ])
    }
  }

  @objc func getPairedDevice(_ resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
    // TODO(meta-sdk-link): deviceManager?.getPaired { ... }
    resolve(NSNull())
  }

  @objc func capturePhoto(_ resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    // TODO(meta-sdk-link): camera.capturePhoto { result in
    //   resolve(["base64": result.base64, "width": result.width, "height": result.height,
    //            "capturedAt": ISO8601DateFormatter().string(from: Date())])
    // }
    reject("not_linked",
           "Meta Wearables DAT SDK is not linked yet. Run `expo prebuild` on a Mac and add the pod.",
           nil)
  }

  @objc func getBatteryLevel(_ resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
    resolve(0)
  }
}
