/** Tiny hash router — `#/live`, `#/sessions/:id`, `#/history`, `#/admin`. */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'live' }
  | { name: 'session'; id: string }
  | { name: 'history' }
  | { name: 'admin' };

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h.startsWith('sessions/')) return { name: 'session', id: h.slice('sessions/'.length) };
  if (h === 'history') return { name: 'history' };
  if (h === 'admin') return { name: 'admin' };
  return { name: 'live' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const handler = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return route;
}

export function go(route: Route): void {
  if (route.name === 'session') window.location.hash = `#/sessions/${route.id}`;
  else window.location.hash = `#/${route.name}`;
}
