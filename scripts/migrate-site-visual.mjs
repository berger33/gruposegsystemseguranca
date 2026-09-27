import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import pg from "pg";

const { loadEnvConfig } = nextEnv;
const { Pool } = pg;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvConfig(projectRoot);

const migrationUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!migrationUrl) {
  console.error("DATABASE_URL or DATABASE_MIGRATION_URL is missing. Configure PostgreSQL in .env.local first.");
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: migrationUrl, max: 1 });
  try {
    const migrations = ["001-site-visual.sql", "002-public-leads.sql"];
    for (const filename of migrations) {
      const migration = await readFile(path.join(projectRoot, "db/migrations", filename), "utf8");
      await pool.query(migration);
      console.log(`Applied idempotent schema step: ${filename}`);
    }
    console.log("Site visual and public lead schemas are ready. The default visual remains Layout 06.");
  } catch (error) {
    console.error("Migration failed. Check the PostgreSQL connection and permissions.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
