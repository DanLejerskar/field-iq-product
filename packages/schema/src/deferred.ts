/**
 * Types DEFERRED for LOTO v1 (PHASE_1_LOTO_V1_CLAUDE_CODE_PROMPT.md M1).
 *
 * These are defined verbatim from FIELD_IQ_PRODUCT_SPEC.md §4.1 so the canonical `Step`
 * shape is preserved, but LOTO v1 does not populate them. Real-time HUD overlays,
 * safety gates, and haptics land in Phase 2.
 */

export type Interaction =
  | { kind: 'observe' }
  | { kind: 'rotate'; axis: 'x' | 'y' | 'z'; degrees: number }
  | { kind: 'press'; force?: 'light' | 'firm' }
  | { kind: 'lift' }
  | { kind: 'attach'; tagId?: string }
  | { kind: 'detach' }
  | { kind: 'scan'; method: 'qr' | 'nfc' | 'ocr' }
  | { kind: 'free-form'; description: string };

export type SafetyGate =
  | { kind: 'none' }
  | { kind: 'ppe-required'; items: ('hardhat' | 'gloves' | 'goggles' | 'respirator')[] }
  | { kind: 'ai-verified-before-next' }
  | { kind: 'human-witness-required'; role: 'supervisor' | 'master-technician' };

export type HapticPattern = 'single-pulse' | 'double-pulse' | 'long-buzz' | 'warning-triple';
