// Router abstraction
export { RouterContext, useAppRouter, useAppSearchParams, useAppParams, useAppLink } from './lib/router';
export type { AppRouter, AppRouterContext } from './lib/router';

// Config
export { setAppConfig, getApiBaseUrl, getAuthBaseUrl, getGatewayUrl } from './lib/constants';
export type { AppConfig } from './lib/constants';

// Layout components
export { AppLayout } from './components/layout/app-layout';
export { AppShell } from './components/layout/app-shell';

// Auth components
export { PasskeyLogin } from './components/auth/passkey-login';
export { PasskeyRegister } from './components/auth/passkey-register';
export { PasswordLogin } from './components/auth/password-login';
export { PasswordRegister } from './components/auth/password-register';

// Pages
export { InvitePage } from './components/invite/invite-page';

// UI primitives
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';

// Stores
export { useAuthStore } from './stores/auth-store';
export { useHubStore } from './stores/server-store';
export { useMessageStore } from './stores/message-store';
export { useSettingsStore } from './stores/settings-store';
