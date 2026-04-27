import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'fs';

// Read version from package.json so it's always in sync
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const appVersion = pkg.version ?? '0.0.0';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  // Capacitor expects the build output in ./dist (matches webDir in capacitor.config.ts)
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 1421,
    strictPort: true,
  },
});
