/** Unit-level checks on the test helpers; runs without a stack. */
import { expect, test } from '@playwright/test';
import { signJwt } from '../helpers/jwt';
import { photoForStep } from '../helpers/fixtures';

test.describe('helpers', () => {
  test('signJwt produces the canonical HS256 header + payload + sig shape', () => {
    const token = signJwt({ sub: 'u1', org: 'o1', role: 'technician' }, 'a'.repeat(64));
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString());
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    expect(payload.sub).toBe('u1');
    expect(payload.org).toBe('o1');
    expect(typeof payload.exp).toBe('number');
  });

  test('photoForStep returns a non-empty base64 JPEG', () => {
    const photo = photoForStep(1);
    expect(photo.length).toBeGreaterThan(200);
    expect(photo.startsWith('/9j/')).toBe(true); // JPEG magic
  });
});
