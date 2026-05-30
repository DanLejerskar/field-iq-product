/**
 * Renders a ReportData to PDF.
 *
 *  - SessionReport → HTML via react-dom/server.renderToStaticMarkup
 *  - HTML → PDF via Puppeteer (Chromium headless)
 *
 * Returns the PDF bytes. Letter + A4 layouts come from the same template; only
 * the @page size differs (set on the Puppeteer side).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { type ReportData, SessionReport } from './templates/SessionReport.js';

export async function renderPdf(data: ReportData): Promise<Buffer> {
  const html = '<!doctype html>' + renderToStaticMarkup(<SessionReport data={data} />);
  // Lazy-load puppeteer so unit tests + the typecheck don't require Chromium.
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return Buffer.from(
      await page.pdf({
        format: data.format === 'a4' ? 'A4' : 'Letter',
        printBackground: true,
        margin: { top: '24mm', right: '24mm', bottom: '24mm', left: '24mm' },
      }),
    );
  } finally {
    await browser.close();
  }
}

export function renderHtml(data: ReportData): string {
  return '<!doctype html>' + renderToStaticMarkup(<SessionReport data={data} />);
}
