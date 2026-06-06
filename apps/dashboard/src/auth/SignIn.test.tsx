/**
 * Dashboard sign-in card.
 *
 * Three states matter:
 *  - Initial render: email input + "Send sign-in link" button.
 *  - Submitting → calls fetch('/api/auth/request-link') with the email,
 *    then renders the "Check your inbox" success card.
 *  - "Use a different email" returns to the input.
 *
 * The paste-token form only appears when /api/auth/config reports
 * `demoAuthEnabled: true`.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignIn } from './SignIn';

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

let container: HTMLDivElement;
let root: Root;
let calls: FetchCall[] = [];

function installFetch(responses: Record<string, () => Response>) {
  calls = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = url.toString();
    calls.push({ url: u, init });
    for (const [match, fn] of Object.entries(responses)) {
      if (u.includes(match)) return fn();
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * React intercepts native `value` setters so a plain `input.value = x`
 * doesn't reach the controlled-input state. The standard workaround is
 * to call the OBJECT prototype's setter directly so React's tracker sees
 * the change.
 */
function setNativeValue(input: HTMLInputElement, value: string) {
  const proto = Object.getPrototypeOf(input);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(input, value);
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe('SignIn', () => {
  it('renders the email form by default and hides the paste-token form', async () => {
    installFetch({
      '/api/auth/config': () =>
        new Response(JSON.stringify({ demoAuthEnabled: false }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    await act(async () => {
      root.render(<SignIn onSignedIn={() => undefined} />);
    });
    await act(async () => {
      await flush();
    });
    expect(container.querySelector('[data-testid="signin-email"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="signin-submit"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="signin-demo-form"]')).toBeFalsy();
  });

  it('submitting POSTs to /api/auth/request-link and shows the inbox card', async () => {
    installFetch({
      '/api/auth/config': () =>
        new Response(JSON.stringify({ demoAuthEnabled: false }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      '/api/auth/request-link': () => new Response(null, { status: 204 }),
    });
    await act(async () => {
      root.render(<SignIn onSignedIn={() => undefined} />);
    });
    await act(async () => {
      await flush();
    });
    const input = container.querySelector('[data-testid="signin-email"]') as HTMLInputElement;
    setNativeValue(input, 'maya@example.com');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const submit = container.querySelector(
      '[data-testid="signin-submit"]',
    ) as HTMLButtonElement;
    await act(async () => {
      submit.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flush();
    });
    const linkCall = calls.find((c) => c.url.includes('/api/auth/request-link'));
    expect(linkCall).toBeTruthy();
    expect(linkCall!.init?.method).toBe('POST');
    expect(JSON.parse((linkCall!.init?.body as string) ?? '{}')).toEqual({
      email: 'maya@example.com',
    });
    expect(container.querySelector('[data-testid="signin-sent"]')).toBeTruthy();
    expect(container.textContent).toContain('Check your inbox');
  });

  it('"Use a different email" returns to the form', async () => {
    installFetch({
      '/api/auth/config': () =>
        new Response(JSON.stringify({ demoAuthEnabled: false }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      '/api/auth/request-link': () => new Response(null, { status: 204 }),
    });
    await act(async () => {
      root.render(<SignIn onSignedIn={() => undefined} defaultEmail="a@b.co" />);
    });
    await act(async () => {
      await flush();
    });
    const submit = container.querySelector(
      '[data-testid="signin-submit"]',
    ) as HTMLButtonElement;
    await act(async () => {
      submit.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flush();
    });
    expect(container.querySelector('[data-testid="signin-sent"]')).toBeTruthy();
    const resetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('different email'),
    ) as HTMLButtonElement;
    await act(async () => {
      resetBtn.click();
    });
    expect(container.querySelector('[data-testid="signin-sent"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="signin-email"]')).toBeTruthy();
  });

  it('renders the paste-token form when demoAuthEnabled=true', async () => {
    installFetch({
      '/api/auth/config': () =>
        new Response(JSON.stringify({ demoAuthEnabled: true }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    await act(async () => {
      root.render(<SignIn onSignedIn={() => undefined} />);
    });
    await act(async () => {
      await flush();
    });
    expect(container.querySelector('[data-testid="signin-demo-form"]')).toBeTruthy();
  });

  it('shows the error banner when request-link rejects', async () => {
    installFetch({
      '/api/auth/config': () =>
        new Response(JSON.stringify({ demoAuthEnabled: false }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      '/api/auth/request-link': () =>
        new Response(JSON.stringify({ title: 'Server is sad' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    await act(async () => {
      root.render(<SignIn onSignedIn={() => undefined} />);
    });
    await act(async () => {
      await flush();
    });
    const submit = container.querySelector(
      '[data-testid="signin-submit"]',
    ) as HTMLButtonElement;
    await act(async () => {
      submit.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flush();
    });
    expect(container.querySelector('[data-testid="signin-error"]')).toBeTruthy();
    expect(container.textContent).toContain('Server is sad');
  });
});
