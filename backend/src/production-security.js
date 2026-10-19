export function validateProduction(env) {
  if (env.NODE_ENV !== 'production') return;
  const problems = [];
  for (const name of ['JWT_SECRET', 'ID_PEPPER']) {
    if (!env[name] || env[name].length < 32 || /change.?me|placeholder|example|development/i.test(env[name])) problems.push(name);
  }
  if (!env.DB_USER || env.DB_USER.toLowerCase() === 'root' || !env.DB_PASSWORD) problems.push('database least-privilege credentials');
  if (env.ALLOW_DEMO_AUTH === 'true' || env.FORCE_DEMO_MODE === 'true') problems.push('demo authentication');
  const origins = String(env.FRONTEND_ORIGINS || env.FRONTEND_ORIGIN || '').split(',');
  if (origins.some(origin => {
    try { const url = new URL(origin.trim()); return url.protocol !== 'https:' || url.origin !== origin.trim() || url.hostname === 'localhost' || url.username || url.password; }
    catch { return true; }
  })) problems.push('HTTPS frontend origins');
  if (problems.length) throw new Error(`Unsafe production configuration: ${problems.join(', ')}`);
}
