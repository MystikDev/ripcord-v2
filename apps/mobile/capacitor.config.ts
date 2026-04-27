import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'gg.ripcord.mobile',
  appName: 'Ripcord',
  webDir: 'dist',
  ios: {
    // Use WKWebView's content insets so the status-bar overlap is handled by
    // safe-area CSS in the web layer (env(safe-area-inset-top)).
    contentInset: 'always',
    // Required for getUserMedia in WKWebView; without this, microphone access
    // prompts repeatedly per session.
    handleApplicationNotifications: false,
  },
  server: {
    // For local dev: point at the Vite dev server on the host machine.
    // Comment back in and set the IP of your dev box for live reload on device.
    // url: 'http://192.168.1.42:1421',
    // cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#050508',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
