import { describe, expect, it, vi } from 'vitest';
import { makeEmailService, type EmailTransport } from './emailService.js';

function noopLog() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: () => noopLog(),
    level: 'info',
  } as unknown as Parameters<typeof makeEmailService>[1];
}

describe('emailService.sendSignInEmail', () => {
  it('falls back to logging when no API key is configured', async () => {
    const transport = vi.fn() as EmailTransport;
    const log = noopLog();
    const svc = makeEmailService(
      { resendApiKey: undefined, fromAddress: 'Field IQ <noreply@app.fieldiq.io>' },
      log,
      transport,
    );
    await svc.sendSignInEmail({ to: 'maya@example.com', magicUrl: 'https://api/x' });
    expect(transport).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalled();
  });

  it('calls the transport with the expected payload when key is set', async () => {
    const calls: Parameters<EmailTransport>[0][] = [];
    const transport: EmailTransport = async (req) => {
      calls.push(req);
    };
    const log = noopLog();
    const svc = makeEmailService(
      { resendApiKey: 're_live_xxx', fromAddress: 'Field IQ <noreply@app.fieldiq.io>' },
      log,
      transport,
    );
    await svc.sendSignInEmail({
      to: 'maya@example.com',
      magicUrl: 'https://api/x?token=abc',
      expiresInMinutes: 15,
    });
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.apiKey).toBe('re_live_xxx');
    expect(c.from).toBe('Field IQ <noreply@app.fieldiq.io>');
    expect(c.to).toBe('maya@example.com');
    expect(c.subject).toBe('Sign in to Field IQ');
    expect(c.html).toContain('https://api/x?token=abc');
    expect(c.text).toContain('https://api/x?token=abc');
    expect(c.html).toContain('15 minutes');
  });

  it('html-escapes embedded quotes in the URL', async () => {
    const calls: Parameters<EmailTransport>[0][] = [];
    const transport: EmailTransport = async (req) => {
      calls.push(req);
    };
    const svc = makeEmailService(
      { resendApiKey: 're_x', fromAddress: 'noreply@x' },
      noopLog(),
      transport,
    );
    await svc.sendSignInEmail({
      to: 'maya@example.com',
      magicUrl: 'https://api/x?token=ab"cd',
    });
    expect(calls[0]!.html).not.toContain('token=ab"cd');
    expect(calls[0]!.html).toContain('token=ab&quot;cd');
  });
});
