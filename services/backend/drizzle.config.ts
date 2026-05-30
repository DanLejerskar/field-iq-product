import { defineConfig } from 'drizzle-kit';

// `generate` does not connect; `migrate`/`push` use DATABASE_URL. A local fallback keeps
// offline `drizzle-kit generate` working without .env.local.
const url =
  process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('<')
    ? process.env.DATABASE_URL
    : 'postgresql://field_iq:field_iq_dev@localhost:5432/field_iq';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
});
