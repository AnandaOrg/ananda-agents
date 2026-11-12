import 'dotenv/config';
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main() {
  if (!existsSync('./drizzle/meta/_journal.json')) {
    console.log('No migrations yet (run `pnpm db:generate` after adding tables)');
    return;
  }
  // Runs in the Vercel build (vercel.json), where a missing variable would otherwise mean "localhost".
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  await pool.end();
  console.log('Migrations applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
