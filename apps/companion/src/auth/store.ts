/**
 * Auth store — pure reducer over a `KvStorage`. Holds the JWT + the principal
 * so the API client + WebSocket can read them. expo-router consumers wrap this
 * with React; tests drive it directly.
 */
import type { KvStorage } from '../api/storage';

const KEY = 'auth';

export interface Principal {
  jwt: string;
  userId: string;
  orgId: string;
  email: string;
  fullName: string;
  role: string;
}

export class AuthStore {
  constructor(private readonly storage: KvStorage) {}

  current(): Principal | undefined {
    const raw = this.storage.getString(KEY);
    return raw ? (JSON.parse(raw) as Principal) : undefined;
  }

  set(p: Principal): void {
    this.storage.set(KEY, JSON.stringify(p));
  }

  clear(): void {
    this.storage.delete(KEY);
  }
}
