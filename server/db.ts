import knex, { type Knex } from 'knex';
import fs from 'node:fs';
import path from 'node:path';

export function createDatabase(): Knex {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fs.mkdirSync(path.resolve(process.env.DATA_DIR || './data'), { recursive: true });

  return knex({
    client: databaseUrl ? 'pg' : 'better-sqlite3',
    connection: databaseUrl || { filename: path.resolve(process.env.DATA_DIR || './data', 'clarity.sqlite') },
    useNullAsDefault: !databaseUrl,
    pool: databaseUrl ? { min: 0, max: 5 } : { min: 1, max: 1 },
  });
}

export async function initializeDatabase(database: Knex): Promise<void> {
  if (database.client.config.client === 'better-sqlite3') {
    await database.raw('PRAGMA journal_mode = WAL');
    await database.raw('PRAGMA foreign_keys = ON');
  }

  await database.raw(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      due_date TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);
  await database.raw(`
    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
      is_completed BOOLEAN NOT NULL DEFAULT FALSE,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await database.raw('CREATE INDEX IF NOT EXISTS idx_tasks_status_position ON tasks(status, position)');
  await database.raw('CREATE INDEX IF NOT EXISTS idx_tasks_status_priority_due ON tasks(status, priority, due_date)');
  await database.raw('CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)');
  await database.raw('CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at)');
  await database.raw('CREATE INDEX IF NOT EXISTS idx_subtasks_task_position ON subtasks(task_id, position)');
}
