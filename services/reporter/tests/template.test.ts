import { describe, expect, it } from 'vitest';
import { renderHtml } from '../src/render.js';
import type { ReportData } from '../src/templates/SessionReport.js';

const data: ReportData = {
  sessionId: 'sess_1',
  procedureTitle: 'LOTO Procedure for DAC #811 Trainer',
  procedureVersion: '1.0.0',
  equipmentName: 'DAC #811 Lockout/Tagout Trainer',
  assetTag: 'DAC-811-01',
  technicianName: 'Maya Wu',
  trainerName: 'Carlos Romero',
  supervisorName: 'Priya Patel',
  startedAt: '2026-05-28T10:00:00.000Z',
  completedAt: '2026-05-28T10:12:00.000Z',
  durationMs: 12 * 60_000,
  steps: Array.from({ length: 10 }, (_, i) => ({
    stepNumber: i + 1,
    title: `STEP ${i + 1}`,
    instruction: `Do step ${i + 1}.`,
    retryCount: 0,
    verdict: {
      verified: true,
      confidence: 'high',
      message: `Step ${i + 1} verified.`,
      detail: 'All good.',
      timestamp: '2026-05-28T10:01:00.000Z',
    },
  })),
  trainerNotes: [{ timestamp: '2026-05-28T10:05:00.000Z', text: 'Good form on the hasp.' }],
  hashChain: Array.from({ length: 10 }, (_, i) => ({
    stepNumber: i + 1,
    link: `${i + 1}`.padEnd(64, '0'),
  })),
  finalLink: '9'.padEnd(64, '0'),
  signature: 'a'.repeat(64),
  signedAt: '2026-05-28T10:13:00.000Z',
  format: 'letter',
};

describe('SessionReport template', () => {
  it('renders to non-empty HTML containing the key sections', () => {
    const html = renderHtml(data);
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('LOTO Audit Report');
    expect(html).toContain('Maya Wu');
    expect(html).toContain('Carlos Romero');
    expect(html).toContain('DAC #811 Lockout/Tagout Trainer');
  });

  it('renders all 10 step cards', () => {
    const html = renderHtml(data);
    for (let i = 1; i <= 10; i++) expect(html).toContain(`Step ${i} ·`);
  });

  it('includes the OSHA compliance section header and at least one citation', () => {
    const html = renderHtml(data);
    expect(html).toContain('OSHA 29 CFR 1910.147 compliance summary');
    expect(html).toContain('29 CFR 1910.147');
  });

  it('embeds the signature + final link', () => {
    const html = renderHtml(data);
    expect(html).toContain('HMAC-SHA256 signature');
    expect(html).toContain('a'.repeat(64));
  });
});
