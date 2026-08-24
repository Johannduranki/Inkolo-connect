import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'mg.mvola.wallet.demo',
  appName: 'Mvola Wallet',
  webDir: 'dist/duranki-login/browser',
  server: {
    androidScheme: 'https',
    cleartext: true
  }
};

export default config;
