import mysql from 'mysql2/promise';
import { getConfig } from './config.js';

let pool;

export async function verifyDatabase(connection = getPool()) {
  const [[row]] = await connection.query('SELECT VERSION() AS version');
  if (!/MariaDB/i.test(String(row?.version || ''))) {
    throw Object.assign(new Error('A MariaDB database is required.'), {code:'UNSUPPORTED_DATABASE'});
  }
}

export function getPool() {
  if (!pool) {
    pool = mysql.createPool(getConfig().database);
  }

  return pool;
}

