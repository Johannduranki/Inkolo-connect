import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'za.co.inkoloconnect.app',
  appName: 'Inkolo Connect',
  webDir: 'dist/duranki-login/browser',
  server: {
    androidScheme: 'https',
    cleartext: true
  }
};

export default config;
