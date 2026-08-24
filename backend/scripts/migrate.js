import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

const databaseName = process.env.DB_NAME;

if (!/^[A-Za-z0-9_]+$/.test(databaseName ?? '')) {
  throw new Error('DB_NAME must contain only letters, numbers, and underscores.');
}

const databaseDirectory = path.resolve('database');
const migrationFiles = (await readdir(databaseDirectory))
  .filter((file) => /^\d+.*\.sql$/.test(file))
  .sort();

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true
});

try {
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
  await connection.query(`USE \`${databaseName}\``);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const file of migrationFiles) {
    const [applied] = await connection.execute(
      'SELECT filename FROM schema_migrations WHERE filename = ? LIMIT 1',
      [file]
    );
    if (applied.length) continue;

    const source = await readFile(path.join(databaseDirectory, file), 'utf8');
    const sql = source
      .replaceAll('duranki_login', databaseName)
      .replaceAll('ADD COLUMN IF NOT EXISTS', 'ADD COLUMN');

    try {
      await connection.query(sql);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }

    await connection.execute(
      'INSERT INTO schema_migrations (filename) VALUES (?)',
      [file]
    );
    console.log(`Applied database migration ${file}`);
  }
} finally {
  await connection.end();
}
