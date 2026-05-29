import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../api/storage';
import { AuthStore } from './store';

describe('AuthStore', () => {
  it('round-trips a principal through storage', () => {
    const s = new MemoryStorage();
    const a = new AuthStore(s);
    expect(a.current()).toBeUndefined();
    a.set({
      jwt: 'jwt.token',
      userId: 'u1',
      orgId: 'o1',
      email: 'maya@eonreality.com',
      fullName: 'Maya Wu',
      role: 'technician',
    });
    expect(a.current()?.email).toBe('maya@eonreality.com');
    a.clear();
    expect(a.current()).toBeUndefined();
  });

  it('survives a process restart (re-reads from storage)', () => {
    const s = new MemoryStorage();
    new AuthStore(s).set({
      jwt: 'jwt.token',
      userId: 'u1',
      orgId: 'o1',
      email: 'x@y.com',
      fullName: 'X',
      role: 'trainer',
    });
    const reborn = new AuthStore(s);
    expect(reborn.current()?.role).toBe('trainer');
  });
});
