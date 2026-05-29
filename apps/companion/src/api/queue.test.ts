import { describe, expect, it, vi } from 'vitest';
import { UploadQueue, type PendingUpload } from './queue';
import { MemoryStorage } from './storage';

const job = (id: string, n: number): Omit<PendingUpload, 'attempts'> => ({
  id,
  sessionId: 's1',
  stepNumber: n,
  photoBase64: 'AAAA',
  capturedAt: '2026-05-28T00:00:00.000Z',
});

describe('UploadQueue', () => {
  it('persists pending uploads and dedupes by id', () => {
    const q = new UploadQueue(new MemoryStorage());
    q.enqueue(job('a', 1));
    q.enqueue(job('a', 1));
    q.enqueue(job('b', 2));
    expect(q.size()).toBe(2);
  });

  it('drains every job when the uploader succeeds', async () => {
    const q = new UploadQueue(new MemoryStorage());
    q.enqueue(job('a', 1));
    q.enqueue(job('b', 2));
    q.enqueue(job('c', 3));
    const uploader = vi.fn(async () => undefined);
    const result = await q.drain(uploader);
    expect(result).toEqual({ uploaded: 3, failed: 0 });
    expect(uploader).toHaveBeenCalledTimes(3);
    expect(q.size()).toBe(0);
  });

  it('stops at the first failure, increments attempts, and resumes on the next drain', async () => {
    const q = new UploadQueue(new MemoryStorage());
    q.enqueue(job('a', 1));
    q.enqueue(job('b', 2));
    let attemptedB = false;
    const uploader = vi.fn(async (j: PendingUpload) => {
      if (j.id === 'b' && !attemptedB) {
        attemptedB = true;
        throw new Error('network');
      }
    });
    const first = await q.drain(uploader);
    expect(first.uploaded).toBe(1);
    expect(first.failed).toBe(1);
    expect(q.size()).toBe(1);
    const head = q.list()[0]!;
    expect(head.id).toBe('b');
    expect(head.attempts).toBe(1);
    const second = await q.drain(uploader);
    expect(second).toEqual({ uploaded: 1, failed: 0 });
    expect(q.size()).toBe(0);
  });

  it('survives a hard restart (re-reads from storage)', () => {
    const storage = new MemoryStorage();
    new UploadQueue(storage).enqueue(job('a', 1));
    const reborn = new UploadQueue(storage);
    expect(reborn.size()).toBe(1);
    expect(reborn.list()[0]!.id).toBe('a');
  });
});
