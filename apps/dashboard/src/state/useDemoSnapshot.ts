/** React hook that subscribes a component to the shared DemoStore snapshot. */
import { useEffect, useState } from 'react';
import { getDemoStore, type DemoSnapshot } from '@field-iq/mock-demo';

export function useDemoSnapshot(): DemoSnapshot {
  const store = getDemoStore();
  const [snapshot, setSnapshot] = useState<DemoSnapshot>(() => store.getSnapshot());
  useEffect(() => store.subscribe(setSnapshot), [store]);
  return snapshot;
}
