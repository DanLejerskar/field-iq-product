/**
 * Seeds the DAC #811 equipment + 10-step LOTO procedure. Idempotent: a second run is a
 * no-op (upsert by natural keys). Run via `pnpm seed`.
 */
import { eq, and } from 'drizzle-orm';
import { closeDb, getDb } from '../src/db/client.js';
import { equipment, organizations, procedures, steps, users } from '../src/db/schema.js';
import { SEED_EQUIPMENT, SEED_ORG, SEED_PROCEDURE, SEED_USERS } from './dac811_loto.js';

function info(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

async function seed(): Promise<void> {
  const db = getDb();

  // Organization (natural key: name).
  let [org] = await db.select().from(organizations).where(eq(organizations.name, SEED_ORG.name));
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({ name: SEED_ORG.name, settings: SEED_ORG.settings })
      .returning();
  }
  if (!org) throw new Error('Failed to upsert organization');
  info(`org: ${org.name} (${org.id})`);

  // Users (natural key: email, which is unique).
  for (const u of SEED_USERS) {
    await db
      .insert(users)
      .values({ orgId: org.id, email: u.email, fullName: u.fullName, role: u.role })
      .onConflictDoUpdate({
        target: users.email,
        set: { fullName: u.fullName, role: u.role, orgId: org.id },
      });
  }
  info(`users: ${SEED_USERS.length} upserted`);

  // Equipment (natural key: qr_code_value, which is unique).
  const [eq811] = await db
    .insert(equipment)
    .values({
      orgId: org.id,
      name: SEED_EQUIPMENT.name,
      assetTag: SEED_EQUIPMENT.assetTag,
      qrCodeValue: SEED_EQUIPMENT.qrCodeValue,
      description: SEED_EQUIPMENT.description,
      location: SEED_EQUIPMENT.location,
      photoUrl: SEED_EQUIPMENT.photoUrl,
      metadata: SEED_EQUIPMENT.metadata,
    })
    .onConflictDoUpdate({
      target: equipment.qrCodeValue,
      set: {
        name: SEED_EQUIPMENT.name,
        assetTag: SEED_EQUIPMENT.assetTag,
        description: SEED_EQUIPMENT.description,
        location: SEED_EQUIPMENT.location,
        photoUrl: SEED_EQUIPMENT.photoUrl,
        metadata: SEED_EQUIPMENT.metadata,
      },
    })
    .returning();
  if (!eq811) throw new Error('Failed to upsert equipment');
  info(`equipment: ${eq811.assetTag} (${eq811.id})`);

  // Procedure (natural key: equipment_id + name + version).
  let [proc] = await db
    .select()
    .from(procedures)
    .where(
      and(
        eq(procedures.equipmentId, eq811.id),
        eq(procedures.name, SEED_PROCEDURE.name),
        eq(procedures.version, SEED_PROCEDURE.version),
      ),
    );
  if (!proc) {
    [proc] = await db
      .insert(procedures)
      .values({
        equipmentId: eq811.id,
        name: SEED_PROCEDURE.name,
        version: SEED_PROCEDURE.version,
        description: SEED_PROCEDURE.description,
        totalSteps: SEED_PROCEDURE.steps.length,
        isActive: SEED_PROCEDURE.isActive,
      })
      .returning();
  }
  if (!proc) throw new Error('Failed to upsert procedure');
  info(`procedure: ${proc.name} v${proc.version} (${proc.id})`);

  // Steps (natural key: procedure_id + step_number).
  for (const s of SEED_PROCEDURE.steps) {
    const [existing] = await db
      .select()
      .from(steps)
      .where(and(eq(steps.procedureId, proc.id), eq(steps.stepNumber, s.stepNumber)));
    const values = {
      procedureId: proc.id,
      stepNumber: s.stepNumber,
      title: s.title,
      instruction: s.instruction,
      referenceImageUrl: s.referenceImageUrl,
      verificationRequired: s.verificationRequired,
      verificationPrompt: s.verificationPrompt,
      successCriteria: s.successCriteria,
      retryThreshold: s.retryThreshold,
    };
    if (existing) {
      await db.update(steps).set(values).where(eq(steps.id, existing.id));
    } else {
      await db.insert(steps).values(values);
    }
  }
  info(`steps: ${SEED_PROCEDURE.steps.length} upserted`);
  info('Seed complete.');
}

seed()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => {
    void closeDb();
  });
