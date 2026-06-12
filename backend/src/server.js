import { createApp } from './app.js';
import { getConfig } from './config.js';
import { getPool } from './database.js';

const config = getConfig();

try {
  await getPool().query('SELECT 1');
  createApp().listen(config.port, () => {
    console.log(`Inkolo Connect API listening on http://localhost:${config.port}`);
  });
} catch (error) {
  if (config.allowDemoAuth) {
    console.warn(`Database unavailable; starting in demo mode: ${error.message}`);
    createApp({ databaseAvailable: false }).listen(config.port, () => {
      console.log(`Inkolo Connect demo API listening on http://localhost:${config.port}`);
    });
  } else {
    console.error('Unable to start the API:', error.message);
    process.exitCode = 1;
  }
}
