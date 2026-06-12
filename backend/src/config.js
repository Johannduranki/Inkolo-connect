import 'dotenv/config';

const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'ID_PEPPER', 'JWT_SECRET'];

export function getConfig() {
  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    port: Number(process.env.PORT || 3000),
    frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:4200',
    database: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
      connectionLimit: 10
    },
    idPepper: process.env.ID_PEPPER,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
    allowDemoAuth: process.env.ALLOW_DEMO_AUTH === 'true'
  };
}
