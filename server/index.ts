import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDatabase, initializeDatabase } from './db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const database = createDatabase();

try {
  await initializeDatabase(database);
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not set. SQLite fallback data may not survive a Replit republish; configure managed PostgreSQL for durable production data.');
  }

  const app = createApp(database);
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(currentDir, '../../dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Clarity API listening on ${port}`);
  });
} catch (error) {
  console.error('Clarity failed to initialize:', error);
  await database.destroy();
  process.exit(1);
}
