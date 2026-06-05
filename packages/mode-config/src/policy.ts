/**
 * Mode → behaviour policy. Pure functions. Deterministic. No I/O.
 *
 * Every caller asking "what should I do in this mode?" reads
 * `behaviorFor(mode)`. The downstream packages (genesis-bridge,
 * worker-dialogue, phone-companion-3d) and the consumer apps (dashboard,
 * glasses-webapp) all branch on this object — never on the raw mode string.
 */
import type { ModeBehavior, SessionMode } from './types.js';

export function behaviorFor(mode: SessionMode): ModeBehavior {
  switch (mode) {
    case 'walkthrough':
      return {
        showReferenceProactively: true,
        verifyEveryStep: true,
        voiceAlwaysListening: false,
        hudPowerProfile: 'high',
        autoAdvanceOnVerified: false,
      };
    case 'standby':
      return {
        showReferenceProactively: false,
        verifyEveryStep: false,
        voiceAlwaysListening: true,
        hudPowerProfile: 'low',
        autoAdvanceOnVerified: true,
      };
  }
}

export function isValidMode(s: unknown): s is SessionMode {
  return s === 'walkthrough' || s === 'standby';
}
