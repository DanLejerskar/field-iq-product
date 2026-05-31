import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { magicLinkUrl } from './auth.js';

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

describe('magicLinkUrl', () => {
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
