// Bootstrap MUST run before any @ripcord/ui imports so its side effects
// (forcing Classic layout, registering Capacitor lifecycle hooks) take effect
// before the settings store hydrates.
import './mobile-bootstrap';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { setAppConfig } from '@ripcord/ui';
import { App } from './App';
import './styles.css';

// Initialize config from Vite env vars (baked in at build time).
// Mobile defaults to production endpoints — no localhost fallback because the
// app runs inside WKWebView on a phone, not on a dev machine.
setAppConfig({
  apiBaseUrl: import.meta.env.VITE_API_URL ?? 'https://api.ripcord.gg',
  authBaseUrl: import.meta.env.VITE_AUTH_URL ?? 'https://auth.ripcord.gg',
  gatewayUrl: import.meta.env.VITE_GATEWAY_URL ?? 'wss://gw.ripcord.gg',
  appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
