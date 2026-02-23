import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { setAppConfig } from '@ripcord/ui';
import { App } from './App';
import './styles.css';

// Initialize config from Vite env vars
setAppConfig({
  apiBaseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
  authBaseUrl: import.meta.env.VITE_AUTH_URL ?? 'http://localhost:4002',
  gatewayUrl: import.meta.env.VITE_GATEWAY_URL ?? 'ws://localhost:4001',
  appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
