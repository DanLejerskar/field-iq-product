/**
 * Play / Pause + speed pills. Owns no playback state itself — the
 * surrounding view drives selection via the wallclock-cursor in
 * SessionReplayView's useEffect.
 */
export type PlaybackSpeed = 1 | 2 | 4;

interface Props {
  playing: boolean;
  speed: PlaybackSpeed;
  onTogglePlay: () => void;
  onChangeSpeed: (speed: PlaybackSpeed) => void;
  disabled?: boolean;
}

const SPEEDS: PlaybackSpeed[] = [1, 2, 4];

export function ReplayPlaybackControls({
  playing,
  speed,
  onTogglePlay,
  onChangeSpeed,
  disabled = false,
}: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Playback controls"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 6,
      }}
    >
      <button
        type="button"
        data-testid="replay-play-pause"
        aria-label={playing ? 'Pause playback' : 'Play playback'}
        aria-pressed={playing}
        disabled={disabled}
        onClick={onTogglePlay}
        style={{
          padding: '6px 14px',
          background: playing ? 'var(--retry)' : 'var(--verified)',
          color: '#0B1424',
          border: 'none',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.3,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {playing ? '⏸ Pause' : '▶ Play'}
      </button>
      <span
        aria-hidden
        style={{
          width: 1,
          height: 20,
          background: 'var(--border)',
          margin: '0 4px',
        }}
      />
      <span
        style={{
          fontSize: 11,
          color: 'var(--ink-faint)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        Speed
      </span>
      {SPEEDS.map((s) => {
        const active = s === speed;
        return (
          <button
            key={s}
            type="button"
            data-testid={`replay-speed-${s}`}
            aria-pressed={active}
            aria-label={`Playback speed ${s} times`}
            disabled={disabled}
            onClick={() => onChangeSpeed(s)}
            style={{
              padding: '4px 10px',
              background: active ? 'var(--field)' : 'transparent',
              color: active ? '#0B1424' : 'var(--ink)',
              border: `1px solid ${active ? 'var(--field)' : 'var(--border)'}`,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {s}×
          </button>
        );
      })}
    </div>
  );
}
