// MetaGlassesModule.kt
//
// React Native bridge wrapping the Meta Wearables Device Access Toolkit for
// Android. See https://github.com/facebook/meta-wearables-dat-android.
//
// The DAT SDK is added via the generated build.gradle after `expo prebuild` on
// the dev machine.  Until that lands, methods return deterministic stubs so the
// JS layer can still exercise the flow.
//
// TODO(meta-sdk-link):
//   1. Add `implementation 'com.facebook.meta.wearables:dat:<version>'` to
//      android/app/build.gradle.
//   2. Replace the stub bodies with calls into `com.facebook.meta.wearables.dat.*`.
//   3. Emit `MetaGlasses.connection` events through DeviceEventManagerModule.

package com.eonreality.fieldiq

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
// import com.facebook.meta.wearables.dat.DeviceManager  // uncomment after gradle dep is added.

class MetaGlassesModule(private val ctx: ReactApplicationContext) :
  ReactContextBaseJavaModule(ctx) {

  override fun getName(): String = "MetaGlasses"

  private fun emit(status: String) {
    ctx
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("MetaGlasses.connection", status)
  }

  @ReactMethod
  fun pairDevice(promise: Promise) {
    // TODO(meta-sdk-link): DeviceManager.pair(ctx) { result -> ... }
    emit("connecting")
    val device = Arguments.createMap().apply {
      putString("id", java.util.UUID.randomUUID().toString())
      putString("serial", "RAYBAN-DISPLAY-DEV")
      putString("model", "meta-ray-ban-display")
      putInt("batteryPercent", 92)
    }
    emit("paired")
    promise.resolve(device)
  }

  @ReactMethod
  fun getPairedDevice(promise: Promise) {
    // TODO(meta-sdk-link): DeviceManager.getPaired(ctx) { device -> ... }
    promise.resolve(null)
  }

  @ReactMethod
  fun capturePhoto(promise: Promise) {
    // TODO(meta-sdk-link): glassesCamera.capturePhoto { jpeg ->
    //   val map = Arguments.createMap()
    //   map.putString("base64", Base64.encodeToString(jpeg, Base64.NO_WRAP))
    //   map.putInt("width", w); map.putInt("height", h)
    //   map.putString("capturedAt", java.time.Instant.now().toString())
    //   promise.resolve(map)
    // }
    promise.reject(
      "not_linked",
      "Meta Wearables DAT SDK is not linked yet. Run `expo prebuild` and add the gradle dep.",
    )
  }

  @ReactMethod
  fun getBatteryLevel(promise: Promise) {
    promise.resolve(0)
  }

  // For RN's NativeEventEmitter contract.
  @ReactMethod fun addListener(eventName: String) { /* no-op */ }
  @ReactMethod fun removeListeners(count: Int) { /* no-op */ }
}
