import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MOCK_MODE } from './api';
import { AuthGate } from './auth/AuthGate';
import { clearAuth, loadAuth } from './auth/auth';
import { Admin } from './pages/Admin';
import { History } from './pages/History';
import { LiveSessions } from './pages/LiveSessions';
import { SessionDetail } from './pages/SessionDetail';
import { SessionReplayPage } from './pages/SessionReplayPage';
import { useRoute } from './router';
import { useMockSync } from './state/useMockSync';

const client = new QueryClient();

function CurrentRoute() {
  useMockSync();
  const route = useRoute();
  switch (route.name) {
    case 'session':
      return (
        <PageShell>
          <SessionDetail sessionId={route.id} />
        </PageShell>
      );
    case 'replay':
      return <SessionReplayPage sessionId={route.id} />;
    case 'history':
      return (
        <PageShell>
          <History />
        </PageShell>
      );
    case 'admin':
      return (
        <PageShell>
          <Admin />
        </PageShell>
      );
    default:
      return <LiveSessions />;
  }
}

function PageShell({ children }: { children: ReactNode }) {
  const auth = MOCK_MODE ? null : loadAuth();
  return (
    <div>
      <header className="topbar">
        <div className="brand">EON Field IQ · Trainer Dashboard{MOCK_MODE ? ' · DEMO' : ''}</div>
        <nav className="kpi-strip">
          <a href="#/live" style={{ color: 'var(--ink-dim)', textDecoration: 'none' }}>
            live
          </a>
          <a href="#/history" style={{ color: 'var(--ink-dim)', textDecoration: 'none' }}>
            history
          </a>
          <a href="#/admin" style={{ color: 'var(--ink-dim)', textDecoration: 'none' }}>
            admin
          </a>
          {auth ? (
            <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>
              {auth.user.fullName} ·{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  clearAuth();
                  window.location.assign('/');
                }}
                style={{ color: 'var(--ink-dim)', textDecoration: 'none' }}
              >
                sign out
              </a>
            </span>
          ) : null}
        </nav>
      </header>
      <main style={{ padding: 0 }}>{children}</main>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={client}>
      <AuthGate>
        <CurrentRoute />
      </AuthGate>
    </QueryClientProvider>
  );
}
