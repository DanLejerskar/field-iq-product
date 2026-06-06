import { describe, expect, it } from 'vitest';
import { canAccessCertificate } from './sessionCertificate.js';

const SESSION = {
  orgId: 'org-A',
  technicianUserId: 'user-1',
};

describe('canAccessCertificate', () => {
  it('grants access to the worker who ran the session', () => {
    expect(
      canAccessCertificate(
        { sub: 'user-1', org: 'org-A', role: 'technician' },
        SESSION,
      ),
    ).toBe(true);
  });

  it('grants access to a supervisor in the same org', () => {
    expect(
      canAccessCertificate(
        { sub: 'user-2', org: 'org-A', role: 'supervisor' },
        SESSION,
      ),
    ).toBe(true);
  });

  it('grants access to a trainer in the same org', () => {
    expect(
      canAccessCertificate(
        { sub: 'user-3', org: 'org-A', role: 'trainer' },
        SESSION,
      ),
    ).toBe(true);
  });

  it('grants access to an admin in the same org', () => {
    expect(
      canAccessCertificate(
        { sub: 'user-4', org: 'org-A', role: 'admin' },
        SESSION,
      ),
    ).toBe(true);
  });

  it('denies a technician who did not run the session, even in the same org', () => {
    expect(
      canAccessCertificate(
        { sub: 'user-2', org: 'org-A', role: 'technician' },
        SESSION,
      ),
    ).toBe(false);
  });

  it('denies a supervisor in a different org', () => {
    expect(
      canAccessCertificate(
        { sub: 'user-2', org: 'org-B', role: 'supervisor' },
        SESSION,
      ),
    ).toBe(false);
  });

  it('denies an unknown role even in the same org', () => {
    expect(
      canAccessCertificate(
        { sub: 'user-9', org: 'org-A', role: 'mystery' },
        SESSION,
      ),
    ).toBe(false);
  });
});
