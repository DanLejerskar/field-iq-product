import { describe, expect, it } from 'vitest';
import { mapAuditRowToReplayEvent, type AuditRow } from './replayMapper.js';

function row(over: Partial<AuditRow> = {}): AuditRow {
  return {
    id: 'aud-1',
    sessionId: 'sess-1',
    stepId: null,
    stepNumber: null,
    eventType: 'start',
    photoUrl: null,
    verified: null,
    confidence: null,
    message: null,
    detail: null,
    claudeResponse: null,
    timestamp: '2026-06-06T10:00:00.000Z',
    supersededBy: null,
    ...over,
  };
}

describe('mapAuditRowToReplayEvent', () => {
  it('start → session.started', () => {
    const ev = mapAuditRowToReplayEvent(row({ eventType: 'start' }));
    expect(ev?.type).toBe('session.started');
    expect(ev?.timestamp).toBe('2026-06-06T10:00:00.000Z');
  });

  it('photo_submitted → step.photo_captured with photoUrl', () => {
    const ev = mapAuditRowToReplayEvent(
      row({ eventType: 'photo_submitted', stepNumber: 1, photoUrl: 'data:image/png;base64,xx' }),
    );
    expect(ev?.type).toBe('step.photo_captured');
    if (ev?.type === 'step.photo_captured') {
      expect(ev.payload.photoUrl).toBe('data:image/png;base64,xx');
      expect(ev.stepNumber).toBe(1);
    }
  });

  it('photo_submitted with no photoUrl → null (not projectable)', () => {
    expect(
      mapAuditRowToReplayEvent(row({ eventType: 'photo_submitted', photoUrl: null })),
    ).toBeNull();
  });

  it('verified → step.verified pass', () => {
    const ev = mapAuditRowToReplayEvent(
      row({
        eventType: 'verified',
        stepNumber: 5,
        confidence: 'high',
        message: 'handle down',
      }),
    );
    expect(ev?.type).toBe('step.verified');
    if (ev?.type === 'step.verified') {
      expect(ev.payload.verdict).toBe('pass');
      expect(ev.payload.confidence).toBe(0.9);
      expect(ev.payload.verdictText).toBe('handle down');
    }
  });

  it('error → step.verified fail', () => {
    const ev = mapAuditRowToReplayEvent(
      row({ eventType: 'error', confidence: 'medium', message: 'no hand visible' }),
    );
    expect(ev?.type).toBe('step.verified');
    if (ev?.type === 'step.verified') {
      expect(ev.payload.verdict).toBe('fail');
      expect(ev.payload.confidence).toBe(0.7);
    }
  });

  it('retry → step.retry with reason + previousVerdictText', () => {
    const ev = mapAuditRowToReplayEvent(
      row({
        eventType: 'retry',
        message: 'handle still horizontal',
        detail: 'first try',
      }),
    );
    expect(ev?.type).toBe('step.retry');
    if (ev?.type === 'step.retry') {
      expect(ev.payload.reason).toBe('handle still horizontal');
      expect(ev.payload.previousVerdictText).toBe('first try');
    }
  });

  it('note → worker_dialogue (transcript from detail; intent default describe_problem)', () => {
    const ev = mapAuditRowToReplayEvent(row({ eventType: 'note', detail: 'the valve is stuck' }));
    expect(ev?.type).toBe('worker_dialogue');
    if (ev?.type === 'worker_dialogue') {
      expect(ev.payload.transcript).toBe('the valve is stuck');
      expect(ev.payload.intent).toBe('describe_problem');
      expect(ev.payload.severity).toBeNull();
      expect(ev.payload.aiResponse).toBeNull();
    }
  });

  it('note → worker_dialogue picks structured fields from claudeResponse', () => {
    const ev = mapAuditRowToReplayEvent(
      row({
        eventType: 'note',
        detail: 'whats next',
        claudeResponse: {
          intent: 'whats_next',
          severity: 'low',
          guidance: 'Advancing to step 9.',
        },
      }),
    );
    if (ev?.type === 'worker_dialogue') {
      expect(ev.payload.intent).toBe('whats_next');
      expect(ev.payload.severity).toBe('low');
      expect(ev.payload.aiResponse).toBe('Advancing to step 9.');
    }
  });

  it('note with empty transcript → null', () => {
    expect(mapAuditRowToReplayEvent(row({ eventType: 'note', detail: '   ' }))).toBeNull();
  });

  it('override with safety_alert discriminator → safety_alert', () => {
    const ev = mapAuditRowToReplayEvent(
      row({
        eventType: 'override',
        claudeResponse: {
          kind: 'safety_alert',
          severity: 'critical',
          summary: 'Worker mentioned gas.',
          recommendedAction: 'Evacuate the area now.',
          detectedBy: 'keyword',
        },
      }),
    );
    expect(ev?.type).toBe('safety_alert');
    if (ev?.type === 'safety_alert') {
      expect(ev.payload.severity).toBe('critical');
      expect(ev.payload.detectedBy).toBe('keyword');
      expect(ev.payload.summary).toBe('Worker mentioned gas.');
    }
  });

  it('override without safety_alert kind → null', () => {
    expect(
      mapAuditRowToReplayEvent(
        row({ eventType: 'override', claudeResponse: { kind: 'manual-override' } }),
      ),
    ).toBeNull();
  });

  it('override with safety_alert but missing fields → null', () => {
    expect(
      mapAuditRowToReplayEvent(
        row({
          eventType: 'override',
          claudeResponse: { kind: 'safety_alert', severity: 'medium' },
        }),
      ),
    ).toBeNull();
  });

  it('complete → session.ended', () => {
    expect(mapAuditRowToReplayEvent(row({ eventType: 'complete' }))?.type).toBe('session.ended');
  });

  it('abandon → session.ended', () => {
    expect(mapAuditRowToReplayEvent(row({ eventType: 'abandon' }))?.type).toBe('session.ended');
  });

  it('skip → null (omitted)', () => {
    expect(mapAuditRowToReplayEvent(row({ eventType: 'skip' }))).toBeNull();
  });

  it('unknown event type → null', () => {
    expect(mapAuditRowToReplayEvent(row({ eventType: 'never_heard_of_it' }))).toBeNull();
  });

  it('superseded rows → null (no matter the type)', () => {
    expect(
      mapAuditRowToReplayEvent(row({ eventType: 'verified', supersededBy: 'aud-2' })),
    ).toBeNull();
  });

  it('Date timestamps are converted to ISO strings', () => {
    const ev = mapAuditRowToReplayEvent(
      row({ eventType: 'start', timestamp: new Date('2026-06-06T11:00:00Z') }),
    );
    expect(ev?.timestamp).toBe('2026-06-06T11:00:00.000Z');
  });
});
