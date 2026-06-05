import { describe, expect, it, vi } from 'vitest';
import type { AnthropicMessagesClient } from './anthropic.js';
import { handle } from './handle.js';
import type { SessionContext } from './types.js';

function mockAnthropic(replyText: string): AnthropicMessagesClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: replyText }] }),
    },
  };
}

function rejectingAnthropic(message: string): AnthropicMessagesClient {
  return {
    messages: { create: vi.fn().mockRejectedValue(new Error(message)) },
  };
}

const SAMPLE_CONTEXT: SessionContext = {
  sessionId: 'sess-1',
  procedureId: 'dac811-loto',
  currentStepNumber: 8,
  currentStepTitle: 'CLOSE BALL VALVE',
  currentStepVerificationPrompt:
    'Confirm the ball valve handle is perpendicular to the pipe (CLOSED position).',
  recentVerdicts: [
    {
      stepNumber: 7,
      outcome: 'verified',
      verdictText: 'padlock engaged',
      at: '2026-06-05T22:50:00.000Z',
    },
  ],
};

describe('handle — whats_next', () => {
  it('returns a guidance line referencing the next step; does NOT call Claude', async () => {
    const anthropic = mockAnthropic('unused');
    const r = await handle('whats_next', "what's next", SAMPLE_CONTEXT, { anthropic });
    expect(r.intent).toBe('whats_next');
    expect(r.guidance).toContain('9');
    expect(r.severity).toBeUndefined();
    expect(r.escalate).toBeUndefined();
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });

  it('announces procedure complete at step 10', async () => {
    const anthropic = mockAnthropic('unused');
    const r = await handle(
      'whats_next',
      'next',
      { ...SAMPLE_CONTEXT, currentStepNumber: 10 },
      { anthropic },
    );
    expect(r.guidance.toLowerCase()).toContain('complete');
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });
});

describe('handle — describe_problem (Claude path)', () => {
  it('mirrors a well-formed Claude reply', async () => {
    const anthropic = mockAnthropic(
      JSON.stringify({
        guidance:
          'Release pressure first via the three-drain manifold; handle should rotate freely after.',
        severity: 'medium',
        escalate: true,
      }),
    );
    const r = await handle('describe_problem', 'the valve is stuck', SAMPLE_CONTEXT, {
      anthropic,
    });
    expect(r.intent).toBe('describe_problem');
    expect(r.severity).toBe('medium');
    expect(r.escalate).toBe(true);
    expect(r.guidance).toContain('three-drain manifold');
  });

  it('strips markdown fences before parsing', async () => {
    const anthropic = mockAnthropic(
      '```json\n' +
        JSON.stringify({ guidance: 'Try again carefully.', severity: 'low', escalate: false }) +
        '\n```',
    );
    const r = await handle('describe_problem', 'the handle is sticky', SAMPLE_CONTEXT, {
      anthropic,
    });
    expect(r.severity).toBe('low');
    expect(r.escalate).toBe(false);
  });

  it('forces escalate=true at severity=high even if Claude omitted the flag', async () => {
    const anthropic = mockAnthropic(
      JSON.stringify({
        guidance: 'Stop and wait for your supervisor.',
        severity: 'high',
        escalate: false,
      }),
    );
    const r = await handle('describe_problem', 'something is making a loud bang', SAMPLE_CONTEXT, {
      anthropic,
    });
    expect(r.severity).toBe('high');
    expect(r.escalate).toBe(true);
  });

  it('prepends voice_back_warning to guidance at critical severity', async () => {
    const anthropic = mockAnthropic(
      JSON.stringify({
        guidance: 'Wait for emergency services in a safe location.',
        severity: 'critical',
        escalate: true,
        voice_back_warning: 'Evacuate the area now. Do not operate any electrical equipment.',
      }),
    );
    const r = await handle('describe_problem', 'it smells like gas', SAMPLE_CONTEXT, {
      anthropic,
    });
    expect(r.severity).toBe('critical');
    expect(r.escalate).toBe(true);
    expect(r.guidance).toMatch(/evacuate|do not operate/i);
    expect(r.guidance).toContain('Wait for emergency services');
  });

  it('defaults severity to medium when Claude returns garbage severity', async () => {
    const anthropic = mockAnthropic(
      JSON.stringify({ guidance: 'Try resetting.', severity: 'meh', escalate: false }),
    );
    const r = await handle('describe_problem', 'the thing is acting weird', SAMPLE_CONTEXT, {
      anthropic,
    });
    expect(r.severity).toBe('medium');
  });

  it('upgrades severity to high when a critical keyword is present but Claude graded low', async () => {
    const anthropic = mockAnthropic(
      JSON.stringify({ guidance: 'Probably nothing.', severity: 'low', escalate: false }),
    );
    const r = await handle('describe_problem', 'i smell smoke from the panel', SAMPLE_CONTEXT, {
      anthropic,
    });
    expect(r.severity).toBe('high');
    expect(r.escalate).toBe(true);
  });
});

describe('handle — describe_problem (safety fallback)', () => {
  it('returns critical + evacuation when Claude throws AND transcript hits a critical keyword', async () => {
    const anthropic = rejectingAnthropic('rate limited');
    const r = await handle('describe_problem', 'it smells like gas', SAMPLE_CONTEXT, {
      anthropic,
    });
    expect(r.severity).toBe('critical');
    expect(r.escalate).toBe(true);
    expect(r.guidance).toMatch(/evacuate|do not operate/i);
  });

  it('still escalates (medium) when Claude throws on a non-critical problem', async () => {
    const anthropic = rejectingAnthropic('rate limited');
    const r = await handle('describe_problem', 'the valve is stuck', SAMPLE_CONTEXT, {
      anthropic,
    });
    expect(r.severity).toBe('medium');
    expect(r.escalate).toBe(true);
    expect(r.guidance.toLowerCase()).toContain('supervisor');
  });

  it('falls back when Claude returns malformed JSON', async () => {
    const anthropic = mockAnthropic('definitely not json');
    const r = await handle('describe_problem', 'gas everywhere', SAMPLE_CONTEXT, { anthropic });
    expect(r.severity).toBe('critical');
    expect(r.escalate).toBe(true);
  });

  it('falls back when Claude returns no text content', async () => {
    const anthropic: AnthropicMessagesClient = {
      messages: { create: vi.fn().mockResolvedValue({ content: [] }) },
    };
    const r = await handle('describe_problem', 'gas', SAMPLE_CONTEXT, { anthropic });
    expect(r.severity).toBe('critical');
    expect(r.escalate).toBe(true);
  });
});

describe('handle — unknown', () => {
  it('returns the polite re-prompt; does NOT call Claude', async () => {
    const anthropic = mockAnthropic('unused');
    const r = await handle('unknown', 'is this thing dishwasher safe', SAMPLE_CONTEXT, {
      anthropic,
    });
    expect(r.intent).toBe('unknown');
    expect(r.guidance.toLowerCase()).toContain("didn't catch");
    expect(r.severity).toBeUndefined();
    expect(r.escalate).toBeUndefined();
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });
});
