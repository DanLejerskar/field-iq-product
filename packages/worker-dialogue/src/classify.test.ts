import { describe, expect, it, vi } from 'vitest';
import { classify } from './classify.js';
import type { AnthropicMessagesClient } from './anthropic.js';

function mockAnthropic(replyText: string): AnthropicMessagesClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: replyText }] }),
    },
  };
}

describe('classify — whats_next keyword path', () => {
  const variants = [
    "what's next",
    'whats next',
    'next',
    'next step',
    'show me the next step',
    'okay what now',
    'OK next',
    'Continue',
    'go on',
    'move on',
    "what's the next step",
    'Advance please',
    'proceed',
  ];

  for (const v of variants) {
    it(`"${v}" → whats_next`, async () => {
      expect(await classify(v)).toBe('whats_next');
    });
  }
});

describe('classify — describe_problem keyword path', () => {
  const variants = [
    'the valve is stuck',
    "the valve won't move",
    'I smell gas',
    "there's smoke coming out",
    'something is broken',
    "the handle won't budge",
    "this isn't working",
    "I can't open the disconnect",
    'fire near the panel',
    'sparks from the starter',
    'there is a leak',
    'shock from the handle',
    'something smells weird',
  ];

  for (const v of variants) {
    it(`"${v}" → describe_problem`, async () => {
      expect(await classify(v)).toBe('describe_problem');
    });
  }
});

describe('classify — unknown path', () => {
  const offDomain = [
    "what's the weather like",
    'set a timer for 5 minutes',
    'tell me a joke',
    'how tall is the empire state building',
    'play some music',
  ];

  for (const v of offDomain) {
    it(`"${v}" → unknown without anthropic`, async () => {
      expect(await classify(v)).toBe('unknown');
    });
  }

  it('empty string → unknown', async () => {
    expect(await classify('')).toBe('unknown');
  });

  it('whitespace-only → unknown', async () => {
    expect(await classify('   \n\t  ')).toBe('unknown');
  });

  it('does NOT match "next" as a substring inside "context"', async () => {
    expect(await classify('what was the context of that earlier check')).toBe('unknown');
  });
});

describe('classify — Claude fallback', () => {
  it('calls anthropic on ambiguous input when client supplied', async () => {
    const anthropic = mockAnthropic('describe_problem');
    const r = await classify('the thing is being weird', { anthropic });
    expect(r).toBe('describe_problem');
    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
  });

  it('honours a whats_next classification from Claude', async () => {
    const anthropic = mockAnthropic('whats_next');
    expect(await classify('on to the next', { anthropic })).toBe('whats_next');
  });

  // NOTE: the bare "next" keyword catches this transcript before the
  // ambiguity fallback runs — so we don't expect Claude to be called.
  it('skips the Claude fallback when keyword path resolves', async () => {
    const anthropic = mockAnthropic('describe_problem');
    await classify('next', { anthropic });
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });

  it('does not call anthropic on empty input', async () => {
    const anthropic = mockAnthropic('unknown');
    await classify('', { anthropic });
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });

  it('coerces unrecognized Claude output to unknown', async () => {
    const anthropic = mockAnthropic('I am not sure');
    expect(await classify('hmm something', { anthropic })).toBe('unknown');
  });

  it('returns unknown when the SDK throws', async () => {
    const anthropic: AnthropicMessagesClient = {
      messages: { create: vi.fn().mockRejectedValue(new Error('rate limited')) },
    };
    expect(await classify('hmm ambiguous', { anthropic })).toBe('unknown');
  });

  it('takes only the first token from a chatty Claude reply', async () => {
    const anthropic = mockAnthropic("whats_next — that's my best guess.");
    expect(await classify('on to the thing', { anthropic })).toBe('whats_next');
  });
});
