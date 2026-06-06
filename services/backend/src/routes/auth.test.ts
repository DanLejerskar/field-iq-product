import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appRedirectUrl, buildMagicLinkUrl, magicLinkUrl } from './auth.js';

const SAVED = {
  dashboard: process.env.DASHBOARD_ORIGIN,
  glasses: process.env.GLASSES_ORIGIN,
};

beforeEach(() => {
  delete process.env.DASHBOARD_ORIGIN;
  delete process.env.GLASSES_ORIGIN;
});

afterEach(() => {
  process.env.DASHBOARD_ORIGIN = SAVED.dashboard;
  process.env.GLASSES_ORIGIN = SAVED.glasses;
});

describe('magicLinkUrl (paste-token URL, dev affordance)', () => {
  it('points technicians at GLASSES_ORIGIN', () => {
    process.env.GLASSES_ORIGIN = 'https://glasses.example.com';
    expect(magicLinkUrl('technician', 'tok123')).toBe(
      'https://glasses.example.com/#/auth/verify?token=tok123',
    );
  });

  it('points trainers, supervisors, admins at DASHBOARD_ORIGIN', () => {
    process.env.DASHBOARD_ORIGIN = 'https://dash.example.com';
    for (const role of ['trainer', 'supervisor', 'admin']) {
      expect(magicLinkUrl(role, 'tok')).toBe('https://dash.example.com/#/auth/verify?token=tok');
    }
  });

  it('strips a trailing slash from the configured origin', () => {
    process.env.DASHBOARD_ORIGIN = 'https://dash.example.com/';
    expect(magicLinkUrl('trainer', 'tok')).toBe('https://dash.example.com/#/auth/verify?token=tok');
  });

  it('falls back to localhost defaults when env vars are unset', () => {
    expect(magicLinkUrl('technician', 'tok')).toBe('http://localhost:3002/#/auth/verify?token=tok');
    expect(magicLinkUrl('trainer', 'tok')).toBe('http://localhost:3001/#/auth/verify?token=tok');
  });

  it('treats a placeholder value (<...>) as unset and falls back', () => {
    process.env.DASHBOARD_ORIGIN = '<dashboard-origin>';
    expect(magicLinkUrl('trainer', 'tok')).toBe('http://localhost:3001/#/auth/verify?token=tok');
  });
});

describe('buildMagicLinkUrl (backend URL embedded in email)', () => {
  it('hangs /api/auth/verify?token=… off the base URL', () => {
    expect(buildMagicLinkUrl('https://api.example.com', 'abc-123')).toBe(
      'https://api.example.com/api/auth/verify?token=abc-123',
    );
  });

  it('strips a trailing slash from the base URL', () => {
    expect(buildMagicLinkUrl('https://api.example.com/', 'abc')).toBe(
      'https://api.example.com/api/auth/verify?token=abc',
    );
  });

  it('URL-encodes the token (defensive: token is a uuid but treat it as opaque)', () => {
    expect(buildMagicLinkUrl('https://api.example.com', 'a/b')).toBe(
      'https://api.example.com/api/auth/verify?token=a%2Fb',
    );
  });
});

describe('appRedirectUrl (post-verify 302 destination)', () => {
  it('points technicians at GLASSES_ORIGIN with ?session=<jwt>', () => {
    process.env.GLASSES_ORIGIN = 'https://glasses.example.com';
    expect(appRedirectUrl('technician', 'aaa.bbb.ccc')).toBe(
      'https://glasses.example.com/#/auth/verify?session=aaa.bbb.ccc',
    );
  });

  it('points supervisors at DASHBOARD_ORIGIN', () => {
    process.env.DASHBOARD_ORIGIN = 'https://dash.example.com';
    expect(appRedirectUrl('supervisor', 'jwt')).toBe(
      'https://dash.example.com/#/auth/verify?session=jwt',
    );
  });

  it('URL-encodes the jwt so + and = survive', () => {
    expect(appRedirectUrl('admin', 'a+b/c=d')).toBe(
      'http://localhost:3001/#/auth/verify?session=a%2Bb%2Fc%3Dd',
    );
  });
});
