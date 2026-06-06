/**
 * Session Replay page. Tiny shell that resolves loading / error / empty
 * states; the real timeline + filters + playback lives in
 * `SessionReplayView` so it's straightforward to unit-test with synthetic
 * event arrays.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReplayEvent, ReplayResponse } from '../api/replay';
import { ReplayDetailsPanel } from '../components/replay/ReplayDetailsPanel';
import { ReplayEventList } from '../components/replay/ReplayEventList';
import {
  makeDefaultFilters,
  ReplayFilters,
  type Filters,
} from '../components/replay/ReplayFilters';
import {
  ReplayPlaybackControls,
  type PlaybackSpeed,
} from '../components/replay/ReplayPlaybackControls';
import { ReplayTimeline } from '../components/replay/ReplayTimeline';
import { go } from '../router';
import { useReplay } from '../hooks/useReplay';

export function SessionReplayPage({ sessionId }: { sessionId: string }) {
  const query = useReplay(sessionId);

  if (query.isPending) {
    return <ReplayStateMessage>Loading session replay…</ReplayStateMessage>;
  }
  if (query.error) {
    return (
      <ReplayStateMessage tone="error">
        Could not load this session: {String(query.error)}
      </ReplayStateMessage>
    );
  }
  if (!query.data) {
    return <ReplayStateMessage>No session data.</ReplayStateMessage>;
  }
  return <SessionReplayView data={query.data} />;
}

function ReplayStateMessage({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'info' | 'error';
}) {
  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">EON Field IQ · Session Replay</div>
        <nav className="kpi-strip">
          <a
            href="#/live"
            onClick={(e) => {
              e.preventDefault();
              go({ name: 'live' });
            }}
            style={{ color: 'var(--ink-dim)', textDecoration: 'none' }}
          >
            ← Back to live
          </a>
        </nav>
      </header>
      <main
        style={{
          gridColumn: '1 / -1',
          display: 'grid',
          placeItems: 'center',
          padding: 48,
          color: tone === 'error' ? 'var(--error)' : 'var(--ink-dim)',
        }}
      >
        {children}
      </main>
    </div>
  );
}

interface ViewProps {
  data: ReplayResponse;
}

export function SessionReplayView({ data }: ViewProps) {
  const { session, events } = data;
  const [filters, setFilters] = useState<Filters>(() => makeDefaultFilters());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(events[0]?.id ?? null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);

  const visible = useMemo(() => events.filter((e) => filters[e.type]), [events, filters]);

  // If the selected event becomes invisible (filter just hid it), jump to
  // the closest still-visible event so the details panel doesn't go blank.
  useEffect(() => {
    if (!selectedEventId) return;
    if (visible.some((e) => e.id === selectedEventId)) return;
    if (visible[0]) setSelectedEventId(visible[0].id);
    else setSelectedEventId(null);
  }, [visible, selectedEventId]);

  // Playback. Advances `selectedEventId` to the next visible event at a
  // wallclock pace matching the original session × speed. Pauses on
  // explicit pause + when there's no next event.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  useEffect(() => {
    if (!playing) return;
    if (visible.length < 2) return;
    const currentIdx = visible.findIndex((e) => e.id === selectedEventId);
    if (currentIdx === -1 || currentIdx === visible.length - 1) {
      setPlaying(false);
      return;
    }
    const current = visible[currentIdx]!;
    const next = visible[currentIdx + 1]!;
    const gapMs = Math.max(0, Date.parse(next.timestamp) - Date.parse(current.timestamp));
    const adjusted = gapMs / speed;
    // Cap the gap so multi-minute silences don't make playback feel broken.
    const wait = Math.min(adjusted, 5000);
    const id = window.setTimeout(() => {
      if (!playingRef.current) return;
      setSelectedEventId(next.id);
    }, wait);
    return () => window.clearTimeout(id);
  }, [playing, selectedEventId, visible, speed]);

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr',
        minHeight: '100vh',
        background: 'var(--bg-page)',
      }}
    >
      <header
        className="topbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}
      >
        <div className="brand">
          EON Field IQ · Session Replay
          <div
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: 'var(--ink-dim)',
              marginTop: 4,
            }}
          >
            {session.procedureTitle} · {session.workerName} · {session.status}
            {session.finalOutcome ? ` · ${session.finalOutcome}` : null}
          </div>
        </div>
        <nav
          style={{
            display: 'flex',
            gap: 12,
            color: 'var(--ink-dim)',
            fontSize: 13,
          }}
        >
          <a
            href="#/live"
            onClick={(e) => {
              e.preventDefault();
              go({ name: 'live' });
            }}
            style={{ color: 'var(--ink-dim)', textDecoration: 'none' }}
          >
            ← Live
          </a>
          <a
            href="#/history"
            onClick={(e) => {
              e.preventDefault();
              go({ name: 'history' });
            }}
            style={{ color: 'var(--ink-dim)', textDecoration: 'none' }}
          >
            History
          </a>
        </nav>
      </header>

      <section
        style={{
          display: 'grid',
          gap: 12,
          padding: 16,
          gridTemplateColumns: 'minmax(0, 1fr) auto',
        }}
      >
        <ReplayTimeline
          events={visible}
          selectedEventId={selectedEventId}
          onSelectEvent={setSelectedEventId}
        />
        <ReplayPlaybackControls
          playing={playing}
          speed={speed}
          onTogglePlay={() => setPlaying((p) => !p)}
          onChangeSpeed={setSpeed}
          disabled={visible.length < 2}
        />
        <div style={{ gridColumn: '1 / -1' }}>
          <ReplayFilters filters={filters} onChange={setFilters} />
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '240px minmax(0, 1fr) 320px',
          gap: 12,
          padding: '0 16px 16px',
          minHeight: 0,
        }}
      >
        <aside
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '70vh',
          }}
        >
          <ReplayEventList
            events={visible}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            sessionStartIso={session.startedAt}
          />
        </aside>
        <main
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'auto',
            maxHeight: '70vh',
          }}
        >
          <ReplayDetailsPanel selectedEvent={selectedEvent as ReplayEvent | null} />
        </main>
        <aside
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 12,
            color: 'var(--ink-dim)',
            fontSize: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'var(--ink-faint)',
              marginBottom: 6,
            }}
          >
            Session metadata
          </div>
          <div>Worker: {session.workerName}</div>
          <div>Procedure: {session.procedureTitle}</div>
          <div>Started: {new Date(session.startedAt).toLocaleString()}</div>
          {session.endedAt ? <div>Ended: {new Date(session.endedAt).toLocaleString()}</div> : null}
          <div>Status: {session.status}</div>
          {session.finalOutcome ? <div>Outcome: {session.finalOutcome}</div> : null}
          <div style={{ marginTop: 8 }}>
            Events: {events.length} total · {visible.length} visible
          </div>
        </aside>
      </section>
    </div>
  );
}
