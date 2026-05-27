/**
 * Drizzle schema — mirrors 02_Architecture.md §3.3.2 exactly.
 * Column names are snake_case to match the spec; TS field names are camelCase.
 *
 * audit_log is APPEND-ONLY. A DB trigger (see migrations) rejects UPDATE/DELETE.
 * Corrections insert a new row and set superseded_by on the prior row.
 */
import {
  boolean,
  char,
  customType,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
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
