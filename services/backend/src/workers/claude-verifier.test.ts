import { describe, expect, it, vi } from 'vitest';
import {
  buildClaudeBody,
  extractText,
  parseDataUri,
  parseVerdict,
  verifyJob,
  type AnthropicTransport,
} from './claude-verifier.js';
import type { VerificationJob } from '../services/bus.js';

const TINY = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function job(over: Partial<VerificationJob> = {}): VerificationJob {
  return {
    sessionId: 'sess-1',
    orgId: 'org-1',
    stepId: 'step-1',
    stepNumber: 5,
    photoKey: `data:image/png;base64,${TINY}`,
    verificationPrompt: 'Confirm a red breaker lockout is on the target.',
    ...over,
  };
}

describe('parseDataUri', () => {
  it('pulls media type + base64 out of a data URI', () => {
    const out = parseDataUri(`data:image/jpeg;base64,${TINY}`);
    expect(out).toEqual({ mediaType: 'image/jpeg', base64: TINY });
  });

  it('handles png media type', () => {
    expect(parseDataUri(`data:image/png;base64,${TINY}`)?.mediaType).toBe('image/png');
  });

  it('returns null for an S3-style key', () => {
    expect(parseDataUri('org-1/sess-1/5-abc.jpg')).toBeNull();
  });

  it('returns null for a non-base64 data URI', () => {
    expect(parseDataUri('data:text/plain,hello')).toBeNull();
  });

  it('returns null for an empty body', () => {
    expect(parseDataUri('data:image/jpeg;base64,')).toBeNull();
  });
});

describe('parseVerdict', () => {
  it('parses a clean JSON verdict', () => {
    const v = parseVerdict(
      '{"verified":true,"confidence":"high","message":"Locked.","detail":"Breaker pin engaged."}',
    );
    expect(v).toEqual({
      verified: true,
      confidence: 'high',
      message: 'Locked.',
      detail: 'Breaker pin engaged.',
    });
  });

  it('strips ```json fences', () => {
    const v = parseVerdict(
      '```json\n{"verified":false,"confidence":"medium","message":"Wrong part.","detail":"Yellow valve cover, not breaker."}\n```',
    );
    expect(v.verified).toBe(false);
    expect(v.confidence).toBe('medium');
  });

  it('throws on invalid confidence', () => {
    expect(() =>
      parseVerdict('{"verified":true,"confidence":"super","message":"x","detail":"y"}'),
    ).toThrow();
  });

  it('throws on non-boolean verified', () => {
    expect(() =>
      parseVerdict('{"verified":"yes","confidence":"high","message":"x","detail":"y"}'),
    ).toThrow();
  });

  it('throws on non-JSON', () => {
    expect(() => parseVerdict('I think the photo looks fine!')).toThrow();
  });
});

describe('buildClaudeBody', () => {
  it('puts the image then the prompt in a single user message', () => {
    const body = buildClaudeBody('claude-sonnet-4-6', 'Check the lockout.', {
      mediaType: 'image/jpeg',
      base64: TINY,
    });
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.max_tokens).toBe(400);
    const content = (body.messages as { content: unknown[] }[])[0]!.content as Record<
      string,
      unknown
    >[];
    expect(content[0]!.type).toBe('image');
    expect((content[0]!.source as { data: string }).data).toBe(TINY);
    expect(content[1]!.type).toBe('text');
    expect(content[1]!.text).toBe('Check the lockout.');
  });
});

describe('extractText', () => {
  it('concatenates text blocks, ignoring non-text', () => {
    const text = extractText({
      content: [
        { type: 'text', text: '{"verified":' },
        { type: 'thinking', text: 'ignore me' },
        { type: 'text', text: 'true}' },
      ],
    });
    expect(text).toBe('{"verified":true}');
  });

  it('returns empty string when content is missing', () => {
    expect(extractText({})).toBe('');
  });
});

describe('verifyJob', () => {
  function transportReturning(text: string): AnthropicTransport {
    return async () => ({ content: [{ type: 'text', text }] });
  }

  it('passes a good photo (verified=true)', async () => {
    const transport = vi.fn(
      transportReturning(
        '{"verified":true,"confidence":"high","message":"Locked.","detail":"Breaker pin on target."}',
      ),
    );
    const v = await verifyJob({ model: 'claude-sonnet-4-6', transport }, job());
    expect(v.verified).toBe(true);
    expect(v.confidence).toBe('high');
    expect(transport).toHaveBeenCalledOnce();
  });

  it('rejects a wrong photo (verified=false)', async () => {
    const transport = transportReturning(
      '{"verified":false,"confidence":"high","message":"Wrong component.","detail":"Yellow valve cover on a breaker target."}',
    );
    const v = await verifyJob({ model: 'claude-sonnet-4-6', transport }, job());
    expect(v.verified).toBe(false);
    expect(v.message).toContain('Wrong');
  });

  it('returns a safe retry verdict when the photo is not a data URI', async () => {
    const transport = vi.fn(transportReturning('{}'));
    const v = await verifyJob(
      { model: 'm', transport },
      job({ photoKey: 'org/sess/5-x.jpg' }),
    );
    expect(v.verified).toBe(false);
    expect(v.detail).toContain('not a base64 data URI');
    expect(transport).not.toHaveBeenCalled();
  });

  it('returns a safe retry verdict when Claude errors', async () => {
    const transport: AnthropicTransport = async () => {
      throw new Error('429 rate limited');
    };
    const v = await verifyJob({ model: 'm', transport }, job());
    expect(v.verified).toBe(false);
    expect(v.confidence).toBe('low');
    expect(v.detail).toContain('Verifier error');
  });

  it('returns a safe retry verdict when Claude returns unparseable text', async () => {
    const transport = transportReturning('the photo looks great to me');
    const v = await verifyJob({ model: 'm', transport }, job());
    expect(v.verified).toBe(false);
    expect(v.detail).toContain('Verifier error');
  });

  it('returns a safe retry verdict when Claude returns no text content', async () => {
    const transport: AnthropicTransport = async () => ({ content: [] });
    const v = await verifyJob({ model: 'm', transport }, job());
    expect(v.verified).toBe(false);
    expect(v.detail).toContain('no text content');
  });
});
