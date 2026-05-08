import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.forwardtocharis.securestore',
  appName: 'SecureStore',
  webDir: 'dist',
  plugins: {
    CapacitorPasskey: {
      origin: 'https://secure-store.pages.dev',
      domains: ['secure-store.pages.dev']
    }
  }
};

export default config;
