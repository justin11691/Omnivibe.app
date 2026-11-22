import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.omnivibe.studio',
  appName: 'OmniVibe',
  webDir: 'dist',
  bundledWebRuntime: false,
  backgroundColor: '#0D1117',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0D1117',
    },
  },
};

export default config;
