#!/usr/bin/env node

/**
 * KidSchedule Database Migration Runner
 *
 * Runs all SQL migration files in order against the configured database.
 * Skips migrations that have already been applied.
 * Usage: node scripts/migrate.js
 */

import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database connection
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  max: 1, // Single connection for migrations
  idle_timeout: 0,
  connect_timeout: 10,
});

/**
 * Check if a migration has already been applied by looking for its tables
 */
async function isMigrationApplied(migrationFile) {
  const migrationNumber = migrationFile.split('_')[0];

  // Define which tables each migration creates
  const migrationTables = {
    '0001': ['users', 'sessions', 'families', 'family_members'],
    '0002': ['password_reset_tokens', 'phone_verifications'],
    '0003': ['calendar_events', 'custody_schedules', 'children', 'parents'],
    '0004': ['blog_posts', 'blog_categories'],
    '0005': ['school_events', 'volunteer_tasks', 'school_vault_documents', 'lunch_menus'],
    '0006': ['expenses'],
    '0007': ['message_threads', 'messages', 'hash_chain_verifications'],
    '0008': ['moments', 'moment_reactions'],
    '0009': ['reminders'],
    '0010': ['blog_reading_sessions'],
    '0011': ['vault_documents', 'lunch_accounts'], // school_contacts already exists from 0005
    '0012': ['stripe_customers', 'subscriptions', 'invoices', 'webhook_events'],
    '0013': ['audit_logs', 'rate_limits'], // RLS policies
    '0014': ['schedule_overrides', 'holiday_definitions', 'holiday_exception_rules'],
    '0015': ['scheduled_notifications']
  };

  const tables = migrationTables[migrationNumber];
  if (!tables) return false;

  // Check if any of the tables exist
  for (const table of tables) {
    const result = await sql`SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = ${table} LIMIT 1`;
    if (result.length > 0) {
      return true;
    }
  }

  return false;
}

async function runMigrations() {
  console.log('🚀 Starting database migrations...\n');

  try {
    // Get all migration files
    const migrationsDir = join(__dirname, '..', 'lib', 'persistence', 'migrations');
    const files = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort by filename (0001, 0002, etc.)

    console.log(`Found ${files.length} migration files: ${files.join(', ')}\n`);

    // Run each migration
    for (const file of files) {
      // Check if migration already applied
      if (await isMigrationApplied(file)) {
        console.log(`⏭️  Migration ${file} already applied, skipping\n`);
        continue;
      }

      const filePath = join(migrationsDir, file);
      const migrationSql = readFileSync(filePath, 'utf-8');

      console.log(`📄 Running migration: ${file}`);

      try {
        await sql.unsafe(migrationSql);
        console.log(`✅ Migration ${file} completed successfully\n`);
      } catch (error) {
        console.error(`❌ Migration ${file} failed:`);
        console.error(error.message);
        console.error('\nMigration SQL:');
        console.error(migrationSql);
        throw error;
      }
    }

    console.log('🎉 All migrations completed successfully!');

  } catch (error) {
    console.error('💥 Migration process failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// The lint config prefers top-level await over an async function call
await runMigrations();