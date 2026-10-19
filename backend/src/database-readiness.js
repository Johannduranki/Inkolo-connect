export async function assertDatabaseReady(pool, localUsers = []) {
  const fail = () => { throw Object.assign(new Error('SQL schema and local-data reconciliation are required before switching storage.'), {code:'ER_DURANKI_MIGRATION_REQUIRED'}); };
  const [tables] = await pool.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
  const names = new Set(tables.map(row => row.name));
  for (const name of ['users','user_roles','service_subscriptions','service_applications','member_profiles','member_communities','wallets','wallet_transactions']) {
    if (!names.has(name)) fail();
  }
  const [rows] = await pool.query('SELECT id FROM users');
  const ids = new Set(rows.map(row => String(row.id)));
  if (localUsers.some(user => !ids.has(String(user.id)))) fail();
  // Matching IDs is only a minimum guard, not proof of full business-data parity.
}
