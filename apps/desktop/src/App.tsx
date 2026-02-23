import { Routes, Route, useParams } from 'react-router-dom';
import { TauriRouterProvider } from './router-adapter';
import { UpdateChecker } from './update-checker';
import {
  AppLayout,
  PasswordLogin,
  PasswordRegister,
  InvitePage,
} from '@ripcord/ui';

// ---------------------------------------------------------------------------
// Auth page wrapper (shared between login and register)
// ---------------------------------------------------------------------------

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent shadow-lg shadow-accent/20">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 4h10c4.42 0 8 2.69 8 6s-3.58 6-8 6h-2l8 12h-5.5L11 16H12c3.31 0 6-1.34 6-4s-2.69-4-6-4h-4v18H8V4z" fill="white"/>
              <path d="M6 2l4 2v24l-4 2V2z" fill="rgba(255,255,255,0.6)"/>
            </svg>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-6 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function LoginPage() {
  return (
    <AuthShell>
      <PasswordLogin />
    </AuthShell>
  );
}

function RegisterPage() {
  return (
    <AuthShell>
      <PasswordRegister />
    </AuthShell>
  );
}

function InviteRoute() {
  const { code } = useParams<{ code: string }>();
  return <InvitePage code={code ?? ''} />;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  return (
    <TauriRouterProvider>
      <UpdateChecker />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invite/:code" element={<InviteRoute />} />
        <Route path="/*" element={<AppLayout />} />
      </Routes>
    </TauriRouterProvider>
  );
}
