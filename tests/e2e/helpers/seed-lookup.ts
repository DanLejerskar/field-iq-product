/**
 * Resolves seed-data IDs (Maya's user, the EON org, the DAC #811 equipment, the
 * LOTO procedure) by querying Postgres directly — far simpler than emailing a
 * magic link in a test environment. Requires DATABASE_URL.
 */
export interface SeedIds {
  orgId: string;
  technicianUserId: string;
  equipmentId: string;
  procedureId: string;
}

export async function resolveSeed(): Promise<SeedIds> {
  const { default: postgres } = await import('postgres');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = postgres(url, { max: 1 });
  try {
    const [user] = await sql<{ id: string; org_id: string }[]>`
      SELECT id, org_id FROM users WHERE email = 'maya.wu@eonreality.com'
    `;
    const [equipment] = await sql<{ id: string }[]>`
      SELECT id FROM equipment WHERE qr_code_value = 'EON-LOTO-DAC811-01'
    `;
    const [procedure] = await sql<{ id: string }[]>`
      SELECT id FROM procedures
      WHERE equipment_id = ${equipment!.id} AND version = '1.0.0' AND is_active = true
    `;
    if (!user || !equipment || !procedure) {
      throw new Error('Seed data missing — run `pnpm seed` first');
    }
    return {
      orgId: user.org_id,
      technicianUserId: user.id,
      equipmentId: equipment.id,
      procedureId: procedure.id,
    };
  } finally {
    await sql.end();
  }
}
