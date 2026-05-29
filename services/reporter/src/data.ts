/** Pulls session + audit + steps + users from Postgres for the report template. */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

let conn: ReturnType<typeof postgres> | undefined;
let db: ReturnType<typeof drizzle> | undefined;

function getDb() {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    conn = postgres(url, { max: 1 });
    db = drizzle(conn);
  }
  return db;
}

export interface ReportSessionRow {
  sessionId: string;
  procedureTitle: string;
  procedureVersion: string;
  equipmentName: string;
  assetTag: string;
  technicianName: string;
  startedAt: Date;
  completedAt: Date;
  steps: Array<{
    stepNumber: number;
    title: string;
    instruction: string;
    retryThreshold: number;
  }>;
  audit: Array<{
    stepNumber: number | null;
    eventType: string;
    photoUrl: string | null;
    photoSha256: string | null;
    verified: boolean | null;
    confidence: string | null;
    message: string | null;
    detail: string | null;
    timestamp: Date;
    supersededBy: string | null;
  }>;
}

export async function loadReportData(sessionId: string): Promise<ReportSessionRow> {
  const d = getDb();
  const [row] = await d.execute<{
    session_id: string;
    procedure_title: string;
    procedure_version: string;
    equipment_name: string;
    asset_tag: string;
    technician_name: string;
    started_at: Date;
    completed_at: Date | null;
  }>(sql`
    SELECT
      s.id AS session_id,
      pr.name AS procedure_title,
      pr.version AS procedure_version,
      eq.name AS equipment_name,
      eq.asset_tag AS asset_tag,
      u.full_name AS technician_name,
      s.started_at,
      s.completed_at
    FROM sessions s
    JOIN procedures pr ON pr.id = s.procedure_id
    JOIN equipment eq ON eq.id = s.equipment_id
    JOIN users u ON u.id = s.technician_user_id
    WHERE s.id = ${sessionId}
  `);
  if (!row) throw new Error(`Session ${sessionId} not found`);

  const stepsRaw = await d.execute<{
    step_number: number;
    title: string;
    instruction: string;
    retry_threshold: number;
  }>(sql`
    SELECT step_number, title, instruction, retry_threshold
    FROM steps st
    JOIN sessions s ON s.procedure_id = st.procedure_id
    WHERE s.id = ${sessionId}
    ORDER BY step_number
  `);

  const auditRaw = await d.execute<{
    step_number: number | null;
    event_type: string;
    photo_url: string | null;
    photo_sha256: string | null;
    verified: boolean | null;
    confidence: string | null;
    message: string | null;
    detail: string | null;
    timestamp: Date;
    superseded_by: string | null;
  }>(sql`
    SELECT step_number, event_type, photo_url, photo_sha256, verified, confidence,
           message, detail, timestamp, superseded_by
    FROM audit_log
    WHERE session_id = ${sessionId}
    ORDER BY timestamp
  `);

  return {
    sessionId: row.session_id,
    procedureTitle: row.procedure_title,
    procedureVersion: row.procedure_version,
    equipmentName: row.equipment_name,
    assetTag: row.asset_tag,
    technicianName: row.technician_name,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? new Date(),
    steps: stepsRaw.map((s) => ({
      stepNumber: s.step_number,
      title: s.title,
      instruction: s.instruction,
      retryThreshold: s.retry_threshold,
    })),
    audit: auditRaw.map((a) => ({
      stepNumber: a.step_number,
      eventType: a.event_type,
      photoUrl: a.photo_url,
      photoSha256: a.photo_sha256,
      verified: a.verified,
      confidence: a.confidence,
      message: a.message,
      detail: a.detail,
      timestamp: a.timestamp,
      supersededBy: a.superseded_by,
    })),
  };
}

export async function closeDb(): Promise<void> {
  if (conn) {
    await conn.end();
    conn = undefined;
    db = undefined;
  }
}

// Suppress unused-import lint warnings for these helpers (kept for future use).
void and;
void eq;
void isNull;
