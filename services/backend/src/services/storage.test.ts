import { describe, expect, it } from 'vitest';
import { DataUriStorageAdapter, sha256Hex } from './storage.js';

describe('DataUriStorageAdapter', () => {
  it('stores the photo as a self-contained data URI', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x10, 0x42]);
    const adapter = new DataUriStorageAdapter();
    const { key, sha256 } = await adapter.putPhoto('o', 's', 1, bytes);
    expect(key.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(key.slice('data:image/jpeg;base64,'.length)).toBe(bytes.toString('base64'));
    expect(sha256).toBe(sha256Hex(bytes));
  });

  it('returns the data URI unchanged from presignGet (no expiry needed)', async () => {
    const adapter = new DataUriStorageAdapter();
    const uri = 'data:image/jpeg;base64,AAAA';
    expect(await adapter.presignGet(uri)).toBe(uri);
  });
});
