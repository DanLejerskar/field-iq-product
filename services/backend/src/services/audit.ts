/**
 * The ONLY sanctioned way to write audit_log. Rows are append-only (a DB trigger enforces
 * it); corrections insert a new row and set superseded_by on the prior row.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { auditLog } from '../db/schema.js';
import type { AuditEventType, VerificationConfidence } from '@field-iq/schema';

export interface AuditAppend {
  sessionId: string;
  stepId?: string;
  stepNumber?: number;
  eventType: AuditEventType;
  photoUrl?: string;
  photoSha256?: string;
  claudeRequestId?: string;
  claudeResponse?: Record<string, unknown>;
  verified?: boolean;
  confidence?: VerificationConfidence;
  message?: string;
  detail?: string;
  latitude?: number;
  longitude?: number;
}

export const AuditLogService = {
  async append(entry: AuditAppend): Promise<string> {
    const [row] = await getDb()
      .insert(auditLog)
      .values({
        sessionId: entry.sessionId,
        stepId: entry.stepId,
        stepNumber: entry.stepNumber,
        eventType: entry.eventType,
        photoUrl: entry.photoUrl,
        photoSha256: entry.photoSha256,
        claudeRequestId: entry.claudeRequestId,
        claudeResponse: entry.claudeResponse,
        verified: entry.verified,
        confidence: entry.confidence,
        message: entry.message,
        detail: entry.detail,
        latitude: entry.latitude !== undefined ? String(entry.latitude) : undefined,
        longitude: entry.longitude !== undefined ? String(entry.longitude) : undefined,
      })
      .returning({ id: auditLog.id });
    if (!row) throw new Error('audit append failed');
    return row.id;
  },

  /**
   * Record a correction: insert the new verdict row, then link the prior row via its
   * one-time superseded_by (the only UPDATE the append-only trigger allows).
   */
  async override(priorId: string, entry: AuditAppend): Promise<string> {
    const newId = await AuditLogService.append({ ...entry, eventType: 'override' });
    await getDb().update(auditLog).set({ supersededBy: newId }).where(eq(auditLog.id, priorId));
    return newId;
  },
};
