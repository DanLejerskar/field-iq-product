/**
 * Mock MetaGlassesModule for Expo Go, the JS test runner, and any environment
 * where the native DAT bridge isn't linked. Returns the canned fixture photo from
 * fixtures/dac811-step.jpg.b64 so the full session loop runs without the SDK.
 *
 * In production this is replaced by the real native bridge automatically — see
 * MetaGlassesModule.ts and ./index.ts (selectMetaGlasses).
 */
import type {
  CapturedPhoto,
  ConnectionStatus,
  MetaGlassesModule,
  PairedDevice,
  Unsubscribe,
} from './MetaGlassesModule';
import { FIXTURE_PHOTO_BASE64 } from '../fixtures';

const FAKE_DEVICE: PairedDevice = {
  id: 'mock-device-01',
  serial: 'MOCK-RAYBAN-DISPLAY-001',
  model: 'meta-ray-ban-display',
  batteryPercent: 87,
};

let listeners: Array<(status: ConnectionStatus) => void> = [];
let status: ConnectionStatus = 'disconnected';
let paired: PairedDevice | null = null;

function setStatus(next: ConnectionStatus) {
  status = next;
  for (const cb of listeners) cb(next);
}

export const MetaGlassesMock: MetaGlassesModule = {
  async pairDevice() {
    setStatus('connecting');
    await new Promise((r) => setTimeout(r, 400));
    paired = FAKE_DEVICE;
    setStatus('paired');
    return FAKE_DEVICE;
  },

  async getPairedDevice() {
    return paired;
  },

  async capturePhoto(): Promise<CapturedPhoto> {
    if (!paired) throw new Error('No device paired');
    setStatus('streaming');
    await new Promise((r) => setTimeout(r, 250));
    setStatus('paired');
    return {
      base64: FIXTURE_PHOTO_BASE64,
      width: 1024,
      height: 1024,
      capturedAt: new Date().toISOString(),
    };
  },

  async getBatteryLevel() {
    return paired?.batteryPercent ?? 0;
  },

  onConnectionChange(callback): Unsubscribe {
    listeners.push(callback);
    callback(status);
    return () => {
      listeners = listeners.filter((c) => c !== callback);
    };
  },
};
