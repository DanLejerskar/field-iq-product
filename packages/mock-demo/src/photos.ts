/**
 * Ten placeholder verification-photo data URIs, one per LOTO step. Inline SVG so
 * the demo ships with zero external assets — works offline, works on Vercel's
 * static CDN, no DNS surprises.
 *
 * The visual is a captioned card with the step number and a one-liner of the
 * component being verified — enough to read like a real photo at thumbnail
 * size in the dashboard's feed.
 */

const PALETTE = [
  '#E07B47', // Field IQ coral
  '#5BA8D6', // setup cyan
  '#B284E6', // training purple
  '#10B981', // verified green
  '#F0B23A', // retry amber (used elsewhere)
  '#0B7AB5',
  '#E0625C',
  '#2E8B57',
  '#9B6BD5',
  '#1B998B',
];

const CAPTIONS = [
  'PPE check',
  'QR code on baseplate',
  'Wide shot · energy sources',
  'Local starter · STOPPED',
  'Disconnect · OPEN',
  'Hasp installed',
  'Padlock engaged',
  'Ball valve · CLOSED',
  'LOTO tag attached',
  'START · no activation',
];

function svgPhoto(stepNumber: number, bg: string, caption: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
    <defs>
      <linearGradient id="g${stepNumber}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${bg}" stop-opacity="1"/>
        <stop offset="1" stop-color="#0B1424" stop-opacity="1"/>
      </linearGradient>
    </defs>
    <rect width="600" height="600" fill="url(#g${stepNumber})"/>
    <rect x="40" y="40" width="520" height="520" fill="none" stroke="#F5F1E8" stroke-opacity="0.22" stroke-width="2" rx="14"/>
    <text x="60" y="100" fill="#F5F1E8" font-family="Inter,Arial,sans-serif" font-size="22" opacity="0.65">DAC #811 · STEP</text>
    <text x="60" y="220" fill="#F5F1E8" font-family="Inter,Arial,sans-serif" font-size="180" font-weight="800">${stepNumber}</text>
    <text x="60" y="320" fill="#F5F1E8" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="600">${caption}</text>
    <text x="60" y="540" fill="#F5F1E8" font-family="Inter,Arial,sans-serif" font-size="18" opacity="0.55">EON Field IQ · verification capture</text>
    <circle cx="510" cy="80" r="14" fill="#F5F1E8" opacity="0.8"/>
    <circle cx="510" cy="80" r="6" fill="#0B1424"/>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export const PHOTO_DATA_URIS: string[] = Array.from({ length: 10 }, (_, i) =>
  svgPhoto(i + 1, PALETTE[i]!, CAPTIONS[i]!),
);
