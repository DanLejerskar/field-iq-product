/**
 * MetaGlassesModule — TypeScript surface area for the native Meta Wearables Device
 * Access Toolkit bridges (iOS Swift + Android Kotlin).
 *
 * The real native modules live in ios/ and android/ in this package; both wrap the
 * Meta DAT SDK and expose this interface to JavaScript. On environments where the
 * native module isn't linked yet (Expo Go, the JS test runner, the bundle on an
 * unsupported device), `selectMetaGlasses()` falls back to the mock at
 * MetaGlassesModule.mock.ts so the JS layer is testable end-to-end without the SDK.
 *
 * Method shapes follow the colleague's spec 02_Architecture.md §3.2.
 */

export interface PairedDevice {
  /** Bluetooth peripheral identifier (UUID-shaped on iOS, MAC-shaped on Android). */
  id: string;
  serial: string;
  model: 'meta-ray-ban-display' | 'meta-oakley-hstn' | 'unknown';
  batteryPercent: number;
}

export interface CapturedPhoto {
  /** JPEG bytes, base64-encoded. The companion uploads this to /verify. */
  base64: string;
  width: number;
  height: number;
  capturedAt: string; // ISO 8601
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'paired' | 'streaming';

export type Unsubscribe = () => void;

export interface MetaGlassesModule {
  pairDevice(): Promise<PairedDevice>;
  getPairedDevice(): Promise<PairedDevice | null>;
  capturePhoto(): Promise<CapturedPhoto>;
  /** 0..100; falls back to 0 if the SDK has not reported a value yet. */
  getBatteryLevel(): Promise<number>;
  onConnectionChange(callback: (status: ConnectionStatus) => void): Unsubscribe;
}
