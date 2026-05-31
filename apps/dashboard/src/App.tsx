import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MOCK_MODE } from './api';
import { Admin } from './pages/Admin';
import { History } from './pages/History';
import { LiveSessions } from './pages/LiveSessions';
import { SessionDetail } from './pages/SessionDetail';
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
        </nav>
      </header>
      <main style={{ padding: 0 }}>{children}</main>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={client}>
      <CurrentRoute />
    </QueryClientProvider>
  );
}
