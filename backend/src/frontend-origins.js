import cors from 'cors';

export function frontendOrigins(env) {
  const configured = String(env.FRONTEND_ORIGINS || env.FRONTEND_ORIGIN || 'http://localhost:4200')
    .split(',').map(origin => origin.trim()).filter(Boolean);
  return [...new Set([
    ...configured,
    'https://app-dev.duranki.network',
    // The existing development deployment is HTTP. Production still requires
    // HTTPS and continues through validateProduction before these are used.
    ...(env.NODE_ENV === 'production' ? [] : [
      'http://app-dev.duranki.network', 'https://localhost', 'capacitor://localhost'
    ])
  ])];
}

export function createFrontendCors(origins) {
  const allowed = new Set(origins);
  return cors({
    origin(origin, callback) {
      if (!origin || allowed.has(origin)) return callback(null, true);
      return callback(Object.assign(new Error('Origin is not allowed by Duranki.'), {status: 403}));
    }
  });
}
