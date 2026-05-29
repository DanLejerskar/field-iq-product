/**
 * Storage abstraction over react-native-mmkv (device) or a Map (tests).
 * Lets the upload queue + auth store be unit-tested without RN at all.
 */
export interface KvStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

export class MemoryStorage implements KvStorage {
  private readonly data = new Map<string, string>();
  getString(key: string): string | undefined {
    return this.data.get(key);
  }
  set(key: string, value: string): void {
    this.data.set(key, value);
  }
  delete(key: string): void {
    this.data.delete(key);
  }
}
