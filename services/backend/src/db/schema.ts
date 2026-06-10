/**
 * Drizzle schema — mirrors 02_Architecture.md §3.3.2 exactly.
 * Column names are snake_case to match the spec; TS field names are camelCase.
 *
 * audit_log is APPEND-ONLY. A DB trigger (see drizzle/0001) rejects DELETE and any UPDATE
 * other than a one-time superseded_by link. Corrections insert a new row and link the prior.
 */
import {
  boolean,
  char,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Case-insensitive text (requires the citext extension; enabled in the first migration). */
const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

// --- Enums ---
export const userRole = pgEnum('user_role', ['admin', 'trainer', 'supervisor', 'technician']);
export const deviceType = pgEnum('device_type', ['glasses', 'phone']);
export const sessionStatus = pgEnum('session_status', [
  'active',
  'completed',
  'abandoned',
  'failed',
]);
export const sessionStepStatus = pgEnum('session_step_status', [
  'pending',
  'in_progress',
  'verified',
  'retrying',
  'skipped',
  'failed',
]);
export const auditEventType = pgEnum('audit_event_type', [
  'photo_submitted',
  'verified',
  'retry',
  'skip',
  'start',
  'complete',
  'abandon',
  'error',
  'override',
  'note',
]);

// --- Organization & access ---
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  settings: jsonb('settings').notNull().default({}),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  email: citext('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  role: userRole('role').notNull(),
  phone: text('phone'),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
});

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  serial: text('serial').notNull(),
  type: deviceType('type').notNull(),
  pairedUserId: uuid('paired_user_id').references(() => users.id),
  pairedAt: timestamp('paired_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

// --- Content ---
export const equipment = pgTable('equipment', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  assetTag: text('asset_tag').notNull(),
  qrCodeValue: text('qr_code_value').notNull().unique(),
  description: text('description'),
  location: text('location'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').notNull().default({}),
});

export const procedures = pgTable('procedures', {
  id: uuid('id').primaryKey().defaultRandom(),
  equipmentId: uuid('equipment_id')
    .notNull()
    .references(() => equipment.id),
  name: text('name').notNull(),
  version: text('version').notNull(),
  description: text('description'),
  totalSteps: integer('total_steps').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id),
});

export const steps = pgTable('steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  procedureId: uuid('procedure_id')
    .notNull()
    .references(() => procedures.id),
  stepNumber: integer('step_number').notNull(),
  title: text('title').notNull(),
  instruction: text('instruction').notNull(),
  referenceImageUrl: text('reference_image_url'),
  verificationRequired: boolean('verification_required').notNull().default(true),
  verificationPrompt: text('verification_prompt'),
  successCriteria: text('success_criteria'),
  retryThreshold: integer('retry_threshold').notNull().default(3),
  skippable: boolean('skippable').notNull().default(false),
  expectedDurationSeconds: integer('expected_duration_seconds'),
});

// --- Runtime ---
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  equipmentId: uuid('equipment_id')
    .notNull()
    .references(() => equipment.id),
  procedureId: uuid('procedure_id')
    .notNull()
    .references(() => procedures.id),
  procedureVersion: text('procedure_version').notNull(),
  technicianUserId: uuid('technician_user_id')
    .notNull()
    .references(() => users.id),
  status: sessionStatus('status').notNull().default('active'),
  currentStepId: uuid('current_step_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  startedLat: numeric('started_lat'),
  startedLng: numeric('started_lng'),
  testMode: boolean('test_mode').notNull().default(false),
});

export const sessionSteps = pgTable('session_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id),
  stepId: uuid('step_id')
    .notNull()
    .references(() => steps.id),
  stepNumber: integer('step_number').notNull(),
  status: sessionStepStatus('status').notNull().default('pending'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  retryCount: integer('retry_count').notNull().default(0),
});

// --- Append-only audit ---
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id),
  stepId: uuid('step_id').references(() => steps.id),
  stepNumber: integer('step_number'),
  eventType: auditEventType('event_type').notNull(),
  photoUrl: text('photo_url'),
  photoSha256: char('photo_sha256', { length: 64 }),
  claudeRequestId: text('claude_request_id'),
  claudeResponse: jsonb('claude_response'),
  verified: boolean('verified'),
  confidence: text('confidence'),
  message: text('message'),
  detail: text('detail'),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  latitude: numeric('latitude'),
  longitude: numeric('longitude'),
  supersededBy: uuid('superseded_by'),
});

// --- Certificates ---
// One row per issued completion certificate. Written by services/cert-generator
// after it builds the PDF; read by GET /api/sessions/:sessionId/certificate.
// cert_id is the human-readable identifier (FIQ-YYYY-MM-DD-XXXXXX); cert_hash
// is the sha256 of the PDF bytes for tamper detection.
export const certificates = pgTable('certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  certId: text('cert_id').notNull().unique(),
  certUrl: text('cert_url').notNull(),
  certHash: text('cert_hash').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  storageBackend: text('storage_backend').notNull(),
  storageKey: text('storage_key').notNull(),
});

// --- Magic links ---
// One row per issued sign-in link. The clickable-email path stores the random
// UUID token here so we can mark it used_at exactly once and surface
// IP / user-agent for audit. Stateless HMAC tokens (auth/tokens.ts) still
// back the gated paste-the-token demo path; this table backs the production
// email-click flow.
export const magicLinks = pgTable('magic_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  token: uuid('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Genesis procedure snapshots (ported from Yogi's bridge, B-28) ---
// An immutable, version-pinned copy of a Genesis procedure at import time. The runtime grades
// against the snapshot (compiled verification_prompt + copied exemplars), never the live Genesis
// procedure, so a Genesis edit can't change a procedure mid-session. A re-import whose content_hash
// differs creates a NEW snapshot row and supersedes the prior (version chain).
export const procedureSnapshots = pgTable(
  'procedure_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    genesisProjectId: text('genesis_project_id').notNull(),
    genesisProcedureId: text('genesis_procedure_id').notNull(),
    title: text('title').notNull(),
    sourceVersion: integer('source_version').notNull(),
    contentHash: text('content_hash').notNull(),
    status: text('status').notNull().default('active'), // active | superseded
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
    supersededBy: uuid('superseded_by'),
  },
  (t) => [index('procedure_snapshots_procedure_idx').on(t.genesisProcedureId)],
);

export const procedureSnapshotSteps = pgTable(
  'procedure_snapshot_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => procedureSnapshots.id),
    stepNumber: integer('step_number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    verificationPrompt: text('verification_prompt').notNull(),
    expectedStateText: text('expected_state_text').notNull(),
    safetyLevel: text('safety_level').notNull(),
    interactionType: text('interaction_type'),
    componentLabel: text('component_label'),
    promptHash: text('prompt_hash').notNull(),
    durationSec: integer('duration_sec'),
  },
  (t) => [index('procedure_snapshot_steps_snapshot_idx').on(t.snapshotId)],
);

export const procedureSnapshotExemplars = pgTable(
  'procedure_snapshot_exemplars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stepId: uuid('step_id')
      .notNull()
      .references(() => procedureSnapshotSteps.id),
    angle: text('angle').notNull(), // authored | front | side | iso
    s3Key: text('s3_key').notNull(),
    sha256: char('sha256', { length: 64 }).notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
  },
  (t) => [index('procedure_snapshot_exemplars_step_idx').on(t.stepId)],
);

// Async result sync-back to Genesis (B-29). A durable outbox: rows are POSTed to Genesis with
// retry, never blocking the session.
export const resultOutbox = pgTable(
  'result_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    payload: jsonb('payload').notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [index('result_outbox_pending_idx').on(t.nextAttemptAt)],
);

// Idempotency guard for photo uploads (ported from Yogi's bridge).
export const uploadClaims = pgTable(
  'upload_claims',
  {
    sessionId: uuid('session_id').notNull(),
    uploadId: text('upload_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.uploadId] }),
    index('upload_claims_created_at_idx').on(t.createdAt),
  ],
);

// --- KPI rollups ---
export const sessionKpis = pgTable('session_kpis', {
  sessionId: uuid('session_id')
    .primaryKey()
    .references(() => sessions.id),
  firstPassRate: numeric('first_pass_rate'),
  retries: integer('retries'),
  durationSeconds: integer('duration_seconds'),
  completedSteps: integer('completed_steps'),
  totalSteps: integer('total_steps'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
});
