import { selectAccountStorage } from './account-storage.js';
import { getConfig } from './config.js';
import { getPool } from './database.js';
import { logger, errorDetails, installFatalLogging } from './logger.js';
import { assertPortAvailable } from './startup-port.js';

installFatalLogging();

const config = getConfig();
async function start(databaseAvailable, accountStorage = 'relational') {
  const {createApp} = await import('./app.js');
  const app=createApp({databaseAvailable, accountStorage});
  await app.locals.storageReady;
  app.listen(config.port,()=>logger.info('api_listening',{port:config.port}));
}

async function main() {
await assertPortAvailable(config.port);
if (config.forceDemoMode && config.allowDemoAuth) {
  logger.warn('persistent_local_storage_enabled');
  await start(false);
} else {
  let connected = false;
  try {
    await getPool().query('SELECT 1');
    connected = true;
    // Migration reconciliation is an operator task, not a prerequisite for
    // restarting an existing database. start() still awaits configured stores.
    await start(true, await selectAccountStorage(getPool()));
  } catch (error) {
    if (config.allowDemoAuth && !connected) {
      logger.warn('database_unavailable_local_fallback',errorDetails(error));
      await start(false);
    } else {
      logger.error('api_startup_failed',errorDetails(error));
      logger.end();
      process.exitCode = 1;
    }
  }
}
}

main().catch(error => {
  logger.error(error.code === 'EADDRINUSE' ? 'api_port_already_in_use' : 'api_startup_failed', {
    ...errorDetails(error), port: config.port
  });
  if (error.code === 'EADDRINUSE') {
    process.stderr.write(`Port ${config.port} is already in use. Do not start a second API; check the running service first.\n`);
  }
  logger.once('finish', () => process.exit(1));
  logger.end();
  setTimeout(() => process.exit(1), 2000).unref();
});
