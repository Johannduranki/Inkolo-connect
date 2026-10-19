export function activeMigrationFiles(files) {
  return files.filter(file => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort();
}

export async function applySchemaMigration(connection,file,sql) {
  const [applied] = await connection.execute('SELECT filename FROM schema_migrations WHERE filename = ? LIMIT 1',[file]);
  if (applied.length) return false;
  // MariaDB DDL may commit independently. Never record success after a partially failed script.
  await connection.query(sql);
  await connection.execute('INSERT INTO schema_migrations (filename) VALUES (?)',[file]);
  return true;
}
