import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_TABLE = '_migrations';

/**
 * Ensures the migrations tracking table exists.
 */
async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Returns the list of already-applied migration names.
 */
async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query(
    `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id ASC`
  );
  return new Set(result.rows.map((row: { name: string }) => row.name));
}

/**
 * Discovers SQL migration files in the migrations directory, sorted by filename.
 */
function discoverMigrationFiles(): { name: string; filePath: string }[] {
  const migrationsDir = path.resolve(__dirname);
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((name) => ({
    name,
    filePath: path.join(migrationsDir, name),
  }));
}

/**
 * Runs all pending database migrations in order.
 * Tracks which migrations have been applied using the _migrations table.
 *
 * @param pool - A pg Pool instance connected to the target database.
 * @returns The list of migration names that were applied during this run.
 */
export async function runMigrations(pool: Pool): Promise<string[]> {
  await ensureMigrationsTable(pool);

  const applied = await getAppliedMigrations(pool);
  const migrationFiles = discoverMigrationFiles();
  const newlyApplied: string[] = [];

  for (const migration of migrationFiles) {
    if (applied.has(migration.name)) {
      continue;
    }

    const sql = fs.readFileSync(migration.filePath, 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`,
        [migration.name]
      );
      await client.query('COMMIT');
      newlyApplied.push(migration.name);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(
        `Migration "${migration.name}" failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      client.release();
    }
  }

  return newlyApplied;
}
