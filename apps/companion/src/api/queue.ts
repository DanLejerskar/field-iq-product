/**
 * Offline upload queue.
 *
 * On every photo capture we record a `PendingUpload` immediately; the queue
 * drains either inline (network up) or on the next NetInfo `connected` event.
 * Persisted to a `KvStorage` so a hard-kill of the app doesn't lose evidence.
 *
 * Pure logic — unit-tested in queue.test.ts with a `MemoryStorage`.
 */
import type { KvStorage } from './storage';

const KEY = 'pendingUploads';

export interface PendingUpload {
  /** UUID — both the dedupe key and the audit_log linkage hint. */
  id: string;
  sessionId: string;
  stepNumber: number;
  photoBase64: string;
  /** Optional geo stamp at capture time. */
  lat?: number;
  lng?: number;
  capturedAt: string;
  attempts: number;
}

export type Uploader = (job: PendingUpload) => Promise<void>;

export class UploadQueue {
  constructor(private readonly storage: KvStorage) {}

  list(): PendingUpload[] {
    const raw = this.storage.getString(KEY);
    return raw ? (JSON.parse(raw) as PendingUpload[]) : [];
  }

  private save(items: PendingUpload[]): void {
    if (items.length === 0) this.storage.delete(KEY);
    else this.storage.set(KEY, JSON.stringify(items));
  }

  enqueue(job: Omit<PendingUpload, 'attempts'>): void {
    const items = this.list();
    if (items.some((i) => i.id === job.id)) return;
    items.push({ ...job, attempts: 0 });
    this.save(items);
  }

  size(): number {
    return this.list().length;
  }

  /** Drain the queue, calling `uploader` for each job in FIFO order. */
  async drain(uploader: Uploader): Promise<{ uploaded: number; failed: number }> {
    let uploaded = 0;
    let failed = 0;
    let remaining = this.list();
    while (remaining.length > 0) {
      const [head, ...rest] = remaining as [PendingUpload, ...PendingUpload[]];
      try {
        await uploader(head);
        uploaded += 1;
        remaining = rest;
        this.save(remaining);
      } catch {
        // Keep the head with an incremented attempt count and stop.  The next
        // NetInfo reconnect will re-enter this method.
        failed = remaining.length;
        const incremented = [{ ...head, attempts: head.attempts + 1 }, ...rest];
        this.save(incremented);
        return { uploaded, failed };
      }
    }
    return { uploaded, failed };
  }
}
