import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CATALOG } from './catalog.js';
import {
  buildUserPrompt,
  parseDataUri,
  recognizeFromPhoto,
  type AnthropicMessagesClient,
} from './vision.js';

const SAMPLE_PHOTO = 'data:image/jpeg;base64,/9j/AAQSkZJRg=='; // arbitrary tiny payload

function mockAnthropic(reply: unknown): AnthropicMessagesClient {
  return {
    messages: { create: vi.fn().mockResolvedValue(reply) },
  };
}

function textBlock(text: string): unknown {
  return { content: [{ type: 'text', text }] };
}

describe('parseDataUri', () => {
  it('extracts mediaType + base64 payload', () => {
    expect(parseDataUri('data:image/png;base64,abc')).toEqual({
      mediaType: 'image/png',
      base64: 'abc',
    });
  });

  it('defaults media type when omitted', () => {
    expect(parseDataUri('data:;base64,abc')).toEqual({ mediaType: 'image/jpeg', base64: 'abc' });
  });

  it('returns null on garbage input', () => {
    expect(parseDataUri('not-a-uri')).toBeNull();
    expect(parseDataUri('data:image/png;base64,')).toBeNull();
  });
});

describe('buildUserPrompt', () => {
  it('mentions every catalog entry, description, and marker', () => {
    const prompt = buildUserPrompt(DEFAULT_CATALOG);
    for (const e of DEFAULT_CATALOG) {
      expect(prompt).toContain(e.equipmentId);
      expect(prompt).toContain(e.description);
      for (const m of e.visualMarkers) expect(prompt).toContain(m);
    }
    expect(prompt).toContain('JSON only');
  });
});

describe('recognizeFromPhoto', () => {
  it('returns a vision Recognition on a well-formed Claude reply', async () => {
    const anthropic = mockAnthropic(
      textBlock(
        JSON.stringify({
          equipmentId: 'DAC-811-01',
          confidence: 0.92,
          reasoning: 'matches all visual markers',
        }),
      ),
    );
    const r = await recognizeFromPhoto(SAMPLE_PHOTO, {
      anthropic,
      catalog: DEFAULT_CATALOG,
    });
    expect(r).toEqual({
      equipmentId: 'DAC-811-01',
      source: 'vision',
      confidence: 0.92,
      detail: 'matches all visual markers',
    });
  });

  it('strips markdown fences before parsing', async () => {
    const anthropic = mockAnthropic(
      textBlock(
        '```json\n' +
          JSON.stringify({ equipmentId: 'DAC-811-01', confidence: 0.8, reasoning: 'ok' }) +
          '\n```',
      ),
    );
    const r = await recognizeFromPhoto(SAMPLE_PHOTO, {
      anthropic,
      catalog: DEFAULT_CATALOG,
    });
    expect(r.equipmentId).toBe('DAC-811-01');
    expect(r.confidence).toBe(0.8);
  });

  it('clamps out-of-range confidence into [0, 1]', async () => {
    const anthropic = mockAnthropic(
      textBlock(
        JSON.stringify({ equipmentId: 'DAC-811-01', confidence: 5, reasoning: 'over-eager' }),
      ),
    );
    const r = await recognizeFromPhoto(SAMPLE_PHOTO, {
      anthropic,
      catalog: DEFAULT_CATALOG,
    });
    expect(r.confidence).toBe(1);
  });

  it('returns null + 0 when Claude picks an equipmentId not in catalog', async () => {
    const anthropic = mockAnthropic(
      textBlock(
        JSON.stringify({
          equipmentId: 'SOMETHING-ELSE-99',
          confidence: 0.9,
          reasoning: 'wishful thinking',
        }),
      ),
    );
    const r = await recognizeFromPhoto(SAMPLE_PHOTO, {
      anthropic,
      catalog: DEFAULT_CATALOG,
    });
    expect(r.equipmentId).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.source).toBe('vision');
    expect(r.detail).toContain('not in catalog');
  });

  it('returns null + 0 + parse detail on malformed JSON', async () => {
    const anthropic = mockAnthropic(textBlock('not valid json at all'));
    const r = await recognizeFromPhoto(SAMPLE_PHOTO, {
      anthropic,
      catalog: DEFAULT_CATALOG,
    });
    expect(r.equipmentId).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.source).toBe('vision');
    expect(r.detail).toMatch(/unparseable/i);
  });

  it('returns null + 0 when the SDK throws', async () => {
    const anthropic: AnthropicMessagesClient = {
      messages: { create: vi.fn().mockRejectedValue(new Error('rate limited')) },
    };
    const r = await recognizeFromPhoto(SAMPLE_PHOTO, {
      anthropic,
      catalog: DEFAULT_CATALOG,
    });
    expect(r.equipmentId).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.detail).toContain('rate limited');
  });

  it('returns null + 0 when the photo data URI is malformed', async () => {
    const anthropic = mockAnthropic(textBlock(''));
    const r = await recognizeFromPhoto('garbage', {
      anthropic,
      catalog: DEFAULT_CATALOG,
    });
    expect(r.equipmentId).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.detail).toContain('valid data URI');
    // We should NOT have called Claude with garbage input.
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });

  it('passes through equipmentId=null + Claude confidence on a "no match" reply', async () => {
    const anthropic = mockAnthropic(
      textBlock(JSON.stringify({ equipmentId: null, confidence: 0.1, reasoning: 'too blurry' })),
    );
    const r = await recognizeFromPhoto(SAMPLE_PHOTO, {
      anthropic,
      catalog: DEFAULT_CATALOG,
    });
    expect(r.equipmentId).toBeNull();
    expect(r.confidence).toBe(0.1);
    expect(r.source).toBe('vision');
    expect(r.detail).toBe('too blurry');
  });
});
