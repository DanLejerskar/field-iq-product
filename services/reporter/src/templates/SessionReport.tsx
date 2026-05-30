/**
 * Audit report template — renders to HTML, then Puppeteer prints it to PDF.
 *
 * Sections: cover · step-by-step record · trainer notes · OSHA compliance
 * summary · audit chain integrity · signature block. Layouts: Letter + A4
 * via `@page` rules; the caller selects via the format query param.
 */
import type { ReactElement } from 'react';
import { citationsFor, COMPLIANCE_HEADER } from '../osha.js';

export interface ReportStep {
  stepNumber: number;
  title: string;
  instruction: string;
  photoSignedUrl?: string;
  verdict?: {
    verified: boolean;
    confidence?: string;
    message?: string;
    detail?: string;
    timestamp?: string;
  };
  retryCount?: number;
  timeOnStepSeconds?: number;
}

export interface ReportTrainerNote {
  timestamp: string;
  stepNumber?: number;
  text: string;
}

export interface ReportData {
  sessionId: string;
  procedureTitle: string;
  procedureVersion: string;
  equipmentName: string;
  assetTag: string;
  technicianName: string;
  trainerName?: string;
  supervisorName?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  steps: ReportStep[];
  trainerNotes: ReportTrainerNote[];
  hashChain: { stepNumber: number; link: string }[];
  finalLink: string;
  signature: string;
  signedAt: string;
  format: 'letter' | 'a4';
}

const CSS = `
  @page { margin: 24mm; }
  body { font-family: 'Inter', 'Calibri', sans-serif; color: #0b1424; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 22pt; margin: 0 0 8pt; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; border-bottom: 1px solid #2c3853; padding-bottom: 4pt; }
  table { border-collapse: collapse; width: 100%; font-size: 10pt; }
  td, th { vertical-align: top; padding: 4pt 6pt; border-bottom: 1px solid #d9d2c5; text-align: left; }
  .meta { color: #5b6675; font-size: 10pt; margin-bottom: 12pt; }
  .step { page-break-inside: avoid; margin-bottom: 14pt; border: 1px solid #d9d2c5; border-radius: 6px; padding: 10pt; }
  .step__head { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 6pt; }
  .step__verdict--true { color: #047857; }
  .step__verdict--false { color: #b54743; }
  .photo { max-width: 100%; max-height: 260pt; border-radius: 4pt; margin: 6pt 0; }
  .sig-block { display: flex; gap: 24pt; margin-top: 24pt; }
  .sig-block > div { flex: 1; border-top: 1px solid #0b1424; padding-top: 4pt; }
  .hash { font-family: 'Courier New', monospace; font-size: 9pt; word-break: break-all; }
  .pagebreak { page-break-before: always; }
`;

function fmtDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function StepCard({ step }: { step: ReportStep }): ReactElement {
  const verified = step.verdict?.verified;
  return (
    <section className="step">
      <header className="step__head">
        <div>
          Step {step.stepNumber} · {step.title}
        </div>
        <div className={`step__verdict--${String(verified ?? false)}`}>
          {verified === undefined ? '— pending —' : verified ? '✓ verified' : '✗ failed'}
        </div>
      </header>
      <div>{step.instruction}</div>
      {step.photoSignedUrl ? (
        <img className="photo" src={step.photoSignedUrl} alt={`Step ${step.stepNumber} photo`} />
      ) : null}
      <div className="meta">
        Retries: {step.retryCount ?? 0}
        {step.timeOnStepSeconds !== undefined ? ` · Time: ${step.timeOnStepSeconds}s` : ''}
        {step.verdict?.timestamp ? ` · ${step.verdict.timestamp}` : ''}
      </div>
      {step.verdict?.message ? (
        <div>
          <strong>AI verdict:</strong> {step.verdict.message}
        </div>
      ) : null}
      {step.verdict?.detail ? <div className="meta">{step.verdict.detail}</div> : null}
    </section>
  );
}

export function SessionReport({ data }: { data: ReportData }): ReactElement {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>{`EON Field IQ — Audit Report ${data.sessionId}`}</title>
        <style>{CSS}</style>
      </head>
      <body>
        {/* Cover */}
        <h1>LOTO Audit Report</h1>
        <div className="meta">
          {data.procedureTitle} · v{data.procedureVersion} · Session {data.sessionId}
        </div>
        <table>
          <tbody>
            <tr>
              <th>Equipment</th>
              <td>
                {data.equipmentName} ({data.assetTag})
              </td>
            </tr>
            <tr>
              <th>Technician</th>
              <td>{data.technicianName}</td>
            </tr>
            {data.trainerName ? (
              <tr>
                <th>Trainer</th>
                <td>{data.trainerName}</td>
              </tr>
            ) : null}
            {data.supervisorName ? (
              <tr>
                <th>Supervisor</th>
                <td>{data.supervisorName}</td>
              </tr>
            ) : null}
            <tr>
              <th>Started</th>
              <td>{data.startedAt}</td>
            </tr>
            <tr>
              <th>Completed</th>
              <td>{data.completedAt}</td>
            </tr>
            <tr>
              <th>Duration</th>
              <td>{fmtDuration(data.durationMs)}</td>
            </tr>
            <tr>
              <th>Steps verified</th>
              <td>
                {data.steps.filter((s) => s.verdict?.verified).length} / {data.steps.length}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Step record */}
        <div className="pagebreak" />
        <h2>Step-by-step record</h2>
        {data.steps.map((step) => (
          <StepCard key={step.stepNumber} step={step} />
        ))}

        {/* Trainer notes */}
        {data.trainerNotes.length > 0 ? (
          <>
            <h2>Trainer notes</h2>
            <table>
              <tbody>
                {data.trainerNotes.map((n, idx) => (
                  <tr key={idx}>
                    <th style={{ width: 130 }}>{n.timestamp}</th>
                    <td>
                      {n.stepNumber ? <strong>Step {n.stepNumber}: </strong> : null}
                      {n.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {/* OSHA compliance summary */}
        <div className="pagebreak" />
        <h2>OSHA 29 CFR 1910.147 compliance summary</h2>
        <p className="meta">{COMPLIANCE_HEADER}</p>
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>OSHA paragraph</th>
              <th>Title</th>
            </tr>
          </thead>
          <tbody>
            {data.steps.flatMap((step) =>
              citationsFor(step.stepNumber).map((c, i) => (
                <tr key={`${step.stepNumber}-${i}`}>
                  <td>{i === 0 ? step.stepNumber : ''}</td>
                  <td>{c.paragraph}</td>
                  <td>{c.title}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>

        {/* Audit chain integrity */}
        <h2>Audit chain integrity</h2>
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>SHA-256 link</th>
            </tr>
          </thead>
          <tbody>
            {data.hashChain.map((link) => (
              <tr key={link.stepNumber}>
                <td>{link.stepNumber}</td>
                <td className="hash">{link.link}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <strong>Final link:</strong> <span className="hash">{data.finalLink}</span>
        </p>
        <p>
          <strong>HMAC-SHA256 signature (REPORT_SIGNING_KEY):</strong>{' '}
          <span className="hash">{data.signature}</span>
        </p>
        <p className="meta">Signed at {data.signedAt}.</p>

        {/* Signature block */}
        <h2>Signatures</h2>
        <div className="sig-block">
          <div>
            <div>Trainee</div>
            <div className="meta">{data.technicianName}</div>
          </div>
          <div>
            <div>Trainer</div>
            <div className="meta">{data.trainerName ?? '_________________'}</div>
          </div>
          <div>
            <div>Supervisor</div>
            <div className="meta">{data.supervisorName ?? '_________________'}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
