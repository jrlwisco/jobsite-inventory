import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jrlwisco.jobsiteinventory',
  appName: 'Job Site Inventory',
  webDir: 'www',
  server: {
    url: 'https://jobsite-inventory.onrender.com',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#1b5e20',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1b5e20',
    },
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'Job Site Inventory',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#1b5e20',
  },
};

export default config;
