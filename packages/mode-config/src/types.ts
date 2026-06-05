/**
 * The Field IQ session-mode contract.
 *
 * Two modes. Same procedure runs either way; only the UX differs:
 *   - walkthrough: trainee-shaped. HUD shows the next step proactively, every
 *     step needs a photo verdict, push-to-talk voice, high HUD refresh rate,
 *     worker confirms each verified step before advancing.
 *   - standby: experienced-worker-shaped. HUD shows an indicator only,
 *     verification is sampled, voice is always listening, low HUD refresh
 *     rate, auto-advance on a clean verdict.
 *
 * See README + WEEKEND_PROMPT_1_mode_config.md for the rationale.
 */

export type SessionMode = 'walkthrough' | 'standby';

export type HudPowerProfile = 'high' | 'low';

export interface ModeBehavior {
  showReferenceProactively: boolean;
  verifyEveryStep: boolean;
  voiceAlwaysListening: boolean;
  hudPowerProfile: HudPowerProfile;
  autoAdvanceOnVerified: boolean;
}

export const DEFAULT_MODE: SessionMode = 'walkthrough';

export const SESSION_MODES: readonly SessionMode[] = ['walkthrough', 'standby'] as const;
