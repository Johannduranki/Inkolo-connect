import { createApp } from './app.js';
import { getConfig } from './config.js';
import { getPool } from './database.js';
import { assertDatabaseReady } from './database-readiness.js';
import { existsSync, readFileSync } from 'node:fs';
import { logger, errorDetails, installFatalLogging } from './logger.js';

installFatalLogging();

const config = getConfig();
async function start(databaseAvailable) {
  const app=createApp({databaseAvailable});
  await app.locals.storageReady;
  app.listen(config.port,()=>logger.info('api_listening',{port:config.port}));
}

if (config.forceDemoMode && config.allowDemoAuth) {
  logger.warn('persistent_local_storage_enabled');
  await start(false);
} else {
  try {
    await getPool().query('SELECT 1');
    const store = new URL('../data/platform-store.json', import.meta.url);
    const localUsers = existsSync(store) ? JSON.parse(readFileSync(store, 'utf8')).users ?? [] : [];
    await assertDatabaseReady(getPool(), localUsers);
    await start(true);
  } catch (error) {
    if (config.allowDemoAuth) {
      logger.warn('database_unavailable_local_fallback',errorDetails(error));
      await start(false);
    } else {
      logger.error('api_startup_failed',errorDetails(error));
      logger.end();
      process.exitCode = 1;
    }
  }
}
