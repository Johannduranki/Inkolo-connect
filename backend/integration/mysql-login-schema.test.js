import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {verifyPassword} from '../src/password-security.js';

test('migrated MariaDB supports password lookup and all login role sources', async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  });
  try {
    await connection.beginTransaction();
    const lookup = createHash('sha256').update(randomUUID()).digest('hex');
    const pepper = 'synthetic-test-pepper';
    const password = 'synthetic-test-password';
    const passwordHash = createHash('sha256').update(`${pepper}:${password}`).digest('hex');
    const [inserted] = await connection.execute(
      `INSERT INTO users(id_number_hash,id_number_last4,first_name,last_name,status,password_hash)
       VALUES(?, '0000', 'Synthetic', 'Test', 'active', ?)`, [lookup, passwordHash]);
    const id = inserted.insertId;
    await connection.execute("INSERT INTO user_roles(user_id,role_code) VALUES(?, 'Member')", [id]);
    await connection.execute("INSERT INTO user_tenant_role(user_id,tenant_id,role) VALUES(?,NULL,'DURANKI_ADMIN')", [id]);
    await assert.rejects(connection.execute(
      "INSERT INTO user_tenant_role(user_id,tenant_id,role) VALUES(?,NULL,'DURANKI_ADMIN')", [id]),
      {code: 'ER_DUP_ENTRY'});
    const [users] = await connection.execute(
      `SELECT id,first_name,last_name,email,status,membership_type,password_hash
       FROM users WHERE id_number_hash=? LIMIT 1`, [lookup]);
    assert.equal(users[0].status, 'active');
    assert.equal(await verifyPassword(password, users[0].password_hash, pepper), true);
    assert.equal(await verifyPassword('incorrect', users[0].password_hash, pepper), false);
    const [roles] = await connection.execute(
      `SELECT role_code AS role FROM user_roles WHERE user_id=?
       UNION SELECT role FROM user_tenant_role WHERE user_id=? AND status='ACTIVE'
       UNION SELECT role FROM user_community_role WHERE user_id=? AND status='ACTIVE'
       UNION SELECT 'Service Provider Admin' AS role FROM service_dashboard_admin WHERE user_id=? AND status='ACTIVE'`,
      [id,id,id,id]);
    assert.deepEqual(roles.map(row => row.role).sort(), ['DURANKI_ADMIN','Member']);
    await connection.execute("UPDATE user_tenant_role SET status='INACTIVE' WHERE user_id=?", [id]);
    const [active] = await connection.execute("SELECT role FROM user_tenant_role WHERE user_id=? AND status='ACTIVE'", [id]);
    assert.equal(active.length, 0);
  } finally {
    await connection.rollback();
    await connection.end();
  }
});
