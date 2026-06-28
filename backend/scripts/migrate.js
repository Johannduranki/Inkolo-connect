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
  for (const file of migrationFiles) {
    const source = await readFile(path.join(databaseDirectory, file), 'utf8');
    const sql = source.replaceAll('duranki_login', databaseName);
    await connection.query(sql);
    console.log(`Applied database migration ${file}`);
  }
} finally {
  await connection.end();
}
