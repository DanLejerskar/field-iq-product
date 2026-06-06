/**
 * Sign-in email body. Plain string templates — no react-email dep so the
 * backend bundle stays thin and the template renders in any runtime.
 *
 * The HTML is intentionally minimal: the button + the fallback link + the
 * "didn't request this? ignore" footer. Outlook/Gmail render this cleanly
 * because we stick to inline styles and a single table-less layout.
 */

export interface SignInEmailInput {
  magicUrl: string;
  expiresInMinutes: number;
}

const NAVY = '#1E2761';
const MUTED = '#666666';
const PAGE_BG = '#F4F4F4';
const CARD_BG = '#FFFFFF';
const BUTTON_FG = '#FFFFFF';

export function renderSignInHtml({ magicUrl, expiresInMinutes }: SignInEmailInput): string {
  const safeUrl = magicUrl.replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Sign in to Field IQ</title>
  </head>
  <body style="margin:0;padding:24px;background:${PAGE_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;">
    <div style="max-width:480px;margin:0 auto;background:${CARD_BG};border-radius:8px;padding:32px;">
      <div style="font-size:14px;letter-spacing:1.5px;color:${NAVY};font-weight:700;">EON AI VENTURES &middot; FIELD IQ</div>
      <h1 style="margin:20px 0 12px;font-size:22px;color:${NAVY};">Sign in to Field IQ</h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#333;">
        Click the button below to sign in. This link expires in
        <strong>${expiresInMinutes} minutes</strong> and can be used once.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${safeUrl}" style="display:inline-block;background:${NAVY};color:${BUTTON_FG};text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:15px;">
          Sign in to Field IQ
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;color:${MUTED};">
        Or paste this URL into your browser:
      </p>
      <p style="margin:0 0 24px;font-size:12px;color:${MUTED};word-break:break-all;">
        <a href="${safeUrl}" style="color:${MUTED};">${safeUrl}</a>
      </p>
      <hr style="border:none;border-top:1px solid #E0E0E0;margin:24px 0;" />
      <p style="margin:0;font-size:12px;color:${MUTED};line-height:1.5;">
        Didn't request this email? You can safely ignore it &mdash; no one can
        sign in without clicking the link above.
      </p>
    </div>
  </body>
</html>`;
}

export function renderSignInText({ magicUrl, expiresInMinutes }: SignInEmailInput): string {
  return [
    'Sign in to Field IQ',
    '',
    `Click the link below to sign in. It expires in ${expiresInMinutes} minutes and can be used once.`,
    '',
    magicUrl,
    '',
    "Didn't request this email? Ignore it — no one can sign in without the link.",
  ].join('\n');
}
