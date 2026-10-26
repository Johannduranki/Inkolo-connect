import { selectAccountStorage } from './account-storage.js';
import { getConfig } from './config.js';
import { getPool, verifyDatabase } from './database.js';
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
await verifyDatabase();
await start(true, await selectAccountStorage(getPool()));
}

main().catch(error => {
  process.exitCode = 1;
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
