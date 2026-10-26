import dotenv from 'dotenv';
import { integrationEnvironment } from './http-harness.js';

integrationEnvironment();
// App config imports dotenv itself. Disable file loading before importing app code.
dotenv.config = () => ({ parsed: {} });

try {
  const { verifyDatabase, getPool } = await import('../src/database.js');
  await verifyDatabase();
  const { createApp } = await import('../src/app.js');
  const { updatePlatformState } = await import('../src/platform-store.js');
  const app = createApp({ databaseAvailable: true, accountStorage: 'platform' });
  await app.locals.storageReady;
  const server = app.listen(0, '127.0.0.1', () => {
    process.send({ type: 'ready', url: `http://127.0.0.1:${server.address().port}` });
  });
  server.on('error', error => { throw error; });
  process.on('message', async message => {
    if (message.type === 'disconnect') {
      try {
        // Close only this child API's actual connections, not the shared DB server.
        await getPool().end();
        process.send({ type: 'disconnected' });
      } catch (error) { process.send({ type: 'failure', message: error.message }); }
      return;
    }
    if (message.type !== 'promote') return;
    try {
      // Fixture setup only: authentication, enrolment and authorization use HTTP.
      await updatePlatformState(state => {
        const user = state.users.find(user => String(user.id) === String(message.id));
        if (!user || user.telephoneNumber !== message.phone || user.firstName !== 'Synthetic' || user.lastName !== 'HttpFixture') {
          throw Error('Refusing to promote a non-synthetic fixture.');
        }
        user.roles = ['Platform Admin'];
      });
      process.send({ type: 'promoted' });
    } catch (error) { process.send({ type: 'failure', message: error.message }); }
  });
} catch (error) {
  process.send({ type: 'failure', message: `MariaDB HTTP startup failed: ${error.message}` }, () => process.exit(1));
}
