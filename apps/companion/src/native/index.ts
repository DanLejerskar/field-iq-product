/**
 * Picks the real native MetaGlasses module if linked; otherwise the mock.
 * Consumers should always import from here.
 */
import { NativeModules } from 'react-native';
import type { MetaGlassesModule } from './MetaGlassesModule';
import { MetaGlassesMock } from './MetaGlassesModule.mock';

interface NativeBridge {
  pairDevice: () => Promise<unknown>;
  getPairedDevice: () => Promise<unknown>;
  capturePhoto: () => Promise<unknown>;
  getBatteryLevel: () => Promise<number>;
}

function selectMetaGlasses(): MetaGlassesModule {
  const native = (NativeModules as Record<string, unknown>).MetaGlasses as NativeBridge | undefined;
  if (!native) return MetaGlassesMock;
  // The real bridge is provided by ios/MetaGlassesModule.swift +
  // android/.../MetaGlassesModule.kt. They emit a `MetaGlasses.connection` event
  // we forward via DeviceEventEmitter; we'll wire that in alongside the real SDK
  // build on the Mac. For now consumers just call the promise methods.
  return native as unknown as MetaGlassesModule;
}

export const MetaGlasses = selectMetaGlasses();
export type {
  CapturedPhoto,
  ConnectionStatus,
  MetaGlassesModule,
  PairedDevice,
} from './MetaGlassesModule';
