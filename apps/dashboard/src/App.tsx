import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LiveSessions } from './pages/LiveSessions';

const client = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={client}>
      <LiveSessions />
    </QueryClientProvider>
  );
}
