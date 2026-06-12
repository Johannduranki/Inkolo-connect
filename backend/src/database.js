import mysql from 'mysql2/promise';
import { getConfig } from './config.js';

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool(getConfig().database);
  }

  return pool;
}

