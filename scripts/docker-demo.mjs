import { spawn } from 'node:child_process';

const children = new Set();

const backendEnv = {
  ...process.env,
  PORT: process.env.BACKEND_PORT || '3000',
  ALLOW_DEMO_AUTH: process.env.ALLOW_DEMO_AUTH || 'true',
  FORCE_DEMO_MODE: process.env.FORCE_DEMO_MODE || 'true',
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_USER: process.env.DB_USER || 'demo',
  DB_NAME: process.env.DB_NAME || 'duranki_demo',
  ID_PEPPER: process.env.ID_PEPPER || 'local-demo-pepper',
  JWT_SECRET: process.env.JWT_SECRET || 'local-demo-secret',
  FRONTEND_ORIGINS:
    process.env.FRONTEND_ORIGINS || 'http://127.0.0.1:4200,http://localhost:4200'
};

const frontendEnv = {
  ...process.env,
  PORT: process.env.FRONTEND_PORT || '4200',
  HOST: process.env.HOST || '0.0.0.0',
  API_TARGET: process.env.API_TARGET || 'http://127.0.0.1:3000'
};

start('backend', 'node', ['backend/src/server.js'], backendEnv);
start('frontend', 'node', ['scripts/local-demo-server.mjs'], frontendEnv);

function start(name, command, args, env) {
  const child = spawn(command, args, {
    env,
    stdio: 'inherit'
  });

  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (signal) {
      console.log(`${name} stopped with signal ${signal}`);
    } else {
      console.log(`${name} stopped with code ${code}`);
    }
    stopAll();
    process.exit(code || 0);
  });
}

function stopAll() {
  for (const child of children) {
    child.kill('SIGTERM');
  }
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopAll();
  process.exit(0);
});
