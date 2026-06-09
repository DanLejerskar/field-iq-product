/**
 * EON Field IQ — Pump Skid P-204 LOTO Acceptance Test seed.
 *
 * 12-step three-source lockout procedure for a fictional asset (PUMP SKID P-204),
 * built around the EXXOP physical LOTO kit (#1-#9 components). Designed for the
 * acceptance-test run book — the worker tapes printed QR targets to a wall,
 * walks the steps in browser or on the glasses, and the dashboard mirrors live.
 *
 * Component → step mapping (per the run book §1):
 *   #1 Yellow gate-valve cover         → Step 7 (V-204)
 *   #2 Red ball-valve clamshell        → Spare (negative test N1)
 *   #3 Red butterfly / lever-valve     → Spare (negative test N1)
 *   #4 Red breaker pin lockout         → Step 5 (BR-204)
 *   #5 Red 110V plug lockout clamshell → Step 9 (PN-204)
 *   #6 Red small plug / cord wedge     → Spare
 *   #7 Red multi-hole group hasp       → Step 10
 *   #8 Red ZING safety padlock         → Step 11
 *   #9 DANGER tag                       → Step 11
 *
 * Reference photos live as inlined JPEG data URIs in p204_kit_images.ts so the
 * glasses-webapp + dashboard can render them without a CDN or S3.
 */

import { KIT_IMAGES } from './p204_kit_images.js';

export interface SeedOrganization {
  name: string;
  settings: Record<string, unknown>;
}

export interface SeedUser {
  email: string;
  fullName: string;
  role: 'admin' | 'trainer' | 'supervisor' | 'technician';
}

export interface SeedEquipment {
  name: string;
  assetTag: string;
  qrCodeValue: string;
  description: string;
  location: string;
  photoUrl: string;
  metadata: Record<string, unknown>;
}

export interface SeedStep {
  stepNumber: number;
  title: string;
  instruction: string;
  referenceImageUrl: string;
  verificationRequired: boolean;
  verificationPrompt: string;
  successCriteria: string;
  retryThreshold: number;
}

export interface SeedProcedure {
  name: string;
  version: string;
  description: string;
  isActive: boolean;
  steps: SeedStep[];
}

export const SEED_ORG: SeedOrganization = {
  name: 'EON AI Ventures',
  settings: { photoRetentionDays: 365 },
};

export const SEED_USERS: SeedUser[] = [
  { email: 'maya.wu@eonreality.com', fullName: 'Maya Wu', role: 'technician' },
  { email: 'carlos.romero@eonreality.com', fullName: 'Carlos Romero', role: 'trainer' },
  { email: 'priya.patel@eonreality.com', fullName: 'Priya Patel', role: 'supervisor' },
];

export const SEED_EQUIPMENT: SeedEquipment = {
  name: 'Pump Skid P-204 (Acceptance Test)',
  assetTag: 'P-204',
  qrCodeValue: 'EON-LOTO-P204-01',
  description:
    'Fictional pump skid with three energy isolation points: electrical (BR-204), process water (V-204), and pneumatic (PN-204). Used for the EON Field IQ LOTO acceptance test against the EXXOP physical kit.',
  location: 'EON Field IQ Lab',
  photoUrl: KIT_IMAGES.p204,
  metadata: {
    scenario: 'three-source-lockout',
    isolation_points: ['BR-204', 'V-204', 'PN-204'],
    parent_qr: 'P-204',
    kit_components: 9,
  },
};

// The verification prompts below are written for the POSTER + MAGNET demo:
// a printed, labeled PUMP SKID 4204 reference board on which the worker places
// a magnetic card showing the correct lockout device onto the correct labeled
// component, then photographs it through the glasses. The board's printed
// labels (4204, BR204, V204, PN204 — no hyphens) are what Claude reads to
// confirm placement, so the prompts use those exact strings.
//
// These prompts are an UNTESTED first draft (no real poster+magnet photos
// existed when they were written). Expect one tuning round against real shots.
const SCENE =
  'The photo shows a printed lockout-training board: a large labeled photo of ' +
  'PUMP SKID 4204 with its components tagged BR204 (electrical disconnect, a ' +
  'gray box, upper-left), V204 (process water gate valve, the tall valve with a ' +
  'round handwheel, center), and PN204 (pneumatic control plug, the small ' +
  'regulator/gauge assembly, lower-right). The worker places a magnetic card ' +
  'depicting a lockout device onto a component to lock it out, then photographs ' +
  'the board.';

export const SEED_STEPS: SeedStep[] = [
  {
    stepNumber: 1,
    title: 'NOTIFY',
    instruction:
      "Notify operations that PUMP SKID 4204 is going offline, then take a picture of the board.",
    referenceImageUrl: KIT_IMAGES.p204,
    verificationRequired: true,
    verificationPrompt:
      'This is a voice-acknowledged notification step. Accept any photo that shows ' +
      'the worker is present and attending to the lockout board. Return verified=true ' +
      'unless the frame is blank or unusable.',
    successCriteria: 'Worker present and attending to the procedure.',
    retryThreshold: 3,
  },
  {
    stepNumber: 2,
    title: 'IDENTIFY THE SKID',
    instruction:
      "Look at the PUMP SKID 4204 board so the whole skid is in frame. Take a picture.",
    referenceImageUrl: KIT_IMAGES.p204,
    verificationRequired: true,
    verificationPrompt:
      `${SCENE} For this step, confirm the overall PUMP SKID 4204 board is the subject of ` +
      'the photo — the "PUMP SKID 4204" title banner and the skid (blue motor/pump, ' +
      'stainless piping) should be visible. Return verified=true if the 4204 skid board ' +
      'is clearly in frame; verified=false if it is a different subject or unreadable.',
    successCriteria: 'PUMP SKID 4204 board identified.',
    retryThreshold: 3,
  },
  {
    stepNumber: 3,
    title: 'SHUTDOWN',
    instruction: "Confirm the skid is shut down, then take a picture of the board.",
    referenceImageUrl: KIT_IMAGES.p204,
    verificationRequired: true,
    verificationPrompt:
      'This is a voice-acknowledged shutdown step. Accept any photo of the 4204 board ' +
      'as confirmation the worker is at the equipment. Return verified=true unless the ' +
      'frame is blank or unusable.',
    successCriteria: 'Shutdown acknowledged.',
    retryThreshold: 3,
  },
  {
    stepNumber: 4,
    title: 'IDENTIFY ELECTRICAL',
    instruction:
      "Find the BR204 electrical disconnect (gray box, upper-left) on the board. Take a picture of it.",
    referenceImageUrl: KIT_IMAGES.br204,
    verificationRequired: true,
    verificationPrompt:
      `${SCENE} For this step, confirm the BR204 ELECTRICAL DISCONNECT is the primary ` +
      'subject — the gray electrical box labeled "BR204" (with a DANGER 480V three-phase ' +
      'placard). Return verified=true if the BR204 disconnect is clearly the focus; ' +
      'verified=false if the photo centers on a different component (valve, pneumatic, pump).',
    successCriteria: 'BR204 electrical disconnect identified.',
    retryThreshold: 3,
  },
  {
    stepNumber: 5,
    title: 'LOCKOUT THE BREAKER',
    instruction:
      "Place the ELECTRICAL BREAKER LOCKOUT magnet on the BR204 disconnect. Take a picture.",
    referenceImageUrl: KIT_IMAGES[4],
    verificationRequired: true,
    verificationPrompt:
      `${SCENE} For this step, confirm a magnetic card depicting an ELECTRICAL BREAKER ` +
      'LOCKOUT (a red plastic breaker lockout device) has been placed ON or directly OVER ' +
      'the BR204 electrical disconnect (the gray box, upper-left). ' +
      'Return verified=true ONLY if the breaker-lockout card is on the BR204 disconnect. ' +
      'Return verified=false if the card depicts a different lockout device (yellow valve ' +
      'cover, plug lockout, hasp, padlock), OR if the card is placed on the wrong component ' +
      '(V204 valve, PN204 pneumatic, or the pump), OR if no lockout card is present.',
    successCriteria: 'Breaker-lockout magnet placed on BR204 disconnect.',
    retryThreshold: 3,
  },
  {
    stepNumber: 6,
    title: 'IDENTIFY VALVE',
    instruction:
      "Find the V204 process water gate valve (tall valve, round handwheel, center). Take a picture of it.",
    referenceImageUrl: KIT_IMAGES.v204,
    verificationRequired: true,
    verificationPrompt:
      `${SCENE} For this step, confirm the V204 PROCESS WATER GATE VALVE is the primary ` +
      'subject — the tall valve body with a round handwheel on top, labeled "V204". ' +
      'Return verified=true if the V204 valve is clearly the focus; verified=false if the ' +
      'photo centers on a different component.',
    successCriteria: 'V204 gate valve identified.',
    retryThreshold: 3,
  },
  {
    stepNumber: 7,
    title: 'LOCKOUT THE VALVE',
    instruction:
      "Place the GATE VALVE LOCKOUT (yellow cover) magnet on the V204 valve. Take a picture.",
    referenceImageUrl: KIT_IMAGES[1],
    verificationRequired: true,
    verificationPrompt:
      `${SCENE} For this step, confirm a magnetic card depicting a GATE VALVE LOCKOUT ` +
      '(a large YELLOW cylindrical valve-lockout cover, with a DANGER label) has been ' +
      'placed ON or directly OVER the V204 process water gate valve (tall valve, round ' +
      'handwheel, center). ' +
      'Return verified=true ONLY if the yellow valve-lockout card is on the V204 valve. ' +
      'Return verified=false if the card depicts a different device, OR is on the wrong ' +
      'component (BR204, PN204, pump), OR if no lockout card is present.',
    successCriteria: 'Gate-valve-lockout magnet placed on V204 valve.',
    retryThreshold: 3,
  },
  {
    stepNumber: 8,
    title: 'IDENTIFY PNEUMATIC',
    instruction:
      "Find the PN204 pneumatic control plug (small regulator/gauge assembly, lower-right). Take a picture of it.",
    referenceImageUrl: KIT_IMAGES.pn204,
    verificationRequired: true,
    verificationPrompt:
      `${SCENE} For this step, confirm the PN204 PNEUMATIC CONTROL PLUG is the primary ` +
      'subject — the small pneumatic regulator/gauge assembly with colored air lines, ' +
      'labeled "PN204". Return verified=true if PN204 is clearly the focus; verified=false ' +
      'if the photo centers on a different component.',
    successCriteria: 'PN204 pneumatic control identified.',
    retryThreshold: 3,
  },
  {
    stepNumber: 9,
    title: 'LOCKOUT THE PLUG',
    instruction:
      "Place the PLUG LOCKOUT magnet on the PN204 pneumatic plug. Take a picture.",
    referenceImageUrl: KIT_IMAGES[5],
    verificationRequired: true,
    verificationPrompt:
      `${SCENE} For this step, confirm a magnetic card depicting a PLUG / PNEUMATIC ` +
      'LOCKOUT (a red clamshell-style plug-lockout device) has been placed ON or directly ' +
      'OVER the PN204 pneumatic control plug (lower-right). ' +
      'Return verified=true ONLY if the plug-lockout card is on the PN204 component. ' +
      'Return verified=false if the card depicts a different device, OR is on the wrong ' +
      'component (BR204, V204, pump), OR if no lockout card is present.',
    successCriteria: 'Plug-lockout magnet placed on PN204.',
    retryThreshold: 3,
  },
  {
    stepNumber: 10,
    title: 'APPLY GROUP HASP',
    instruction:
      "Place the GROUP HASP magnet next to one of the lockouts already on the board. Take a picture.",
    referenceImageUrl: KIT_IMAGES[7],
    verificationRequired: true,
    verificationPrompt:
      `${SCENE} For this step, confirm a magnetic card depicting a GROUP LOCKOUT HASP ` +
      '(a red multi-hole hasp with a row of padlock holes) has been placed on the board ' +
      'adjacent to or overlapping one of the lockout cards already applied in earlier steps. ' +
      'Return verified=true if the hasp card is present and grouped with an existing lockout; ' +
      'verified=false if the card depicts a different device or no hasp card is present.',
    successCriteria: 'Group-hasp magnet applied alongside an existing lockout.',
    retryThreshold: 3,
  },
  {
    stepNumber: 11,
    title: 'PERSONAL LOCK + TAG',
    instruction:
      "Place the PADLOCK magnet and the DANGER TAG magnet together on the board. Take a picture.",
    referenceImageUrl: KIT_IMAGES[8],
    verificationRequired: true,
    verificationPrompt:
      `${SCENE} For this step, confirm BOTH are present on the board: (1) a magnetic card ` +
      'depicting a PADLOCK (a red safety padlock) AND (2) a magnetic card depicting a ' +
      'DANGER / "DO NOT OPERATE" tag (white card with a red DANGER banner), placed together ' +
      'at the same lockout location. ' +
      'Return verified=true only if BOTH the padlock card and the danger-tag card are ' +
      'visible together; verified=false if either is missing.',
    successCriteria: 'Padlock magnet AND danger-tag magnet applied together.',
    retryThreshold: 3,
  },
  {
    stepNumber: 12,
    title: 'VERIFY ZERO ENERGY',
    instruction:
      "Take a final picture of the fully locked-out 4204 board to confirm zero energy.",
    referenceImageUrl: KIT_IMAGES.p204,
    verificationRequired: true,
    verificationPrompt:
      `${SCENE} For this final step, accept any clear photo of the 4204 board showing the ` +
      'applied lockout cards as confirmation the worker has completed the procedure and ' +
      'verified zero energy. Return verified=true unless the frame is blank or unusable.',
    successCriteria: 'Zero-energy verification acknowledged.',
    retryThreshold: 3,
  },
];

export const SEED_PROCEDURE: SeedProcedure = {
  name: 'LOTO Acceptance Test — Pump Skid P-204',
  version: '1.0.0',
  description:
    'Twelve-step three-source lockout procedure for fictional Pump Skid P-204. Three energy isolation points (BR-204 electrical, V-204 process water, PN-204 pneumatic) are locked out using the EXXOP physical LOTO kit. Aligned with the EON Field IQ LOTO Acceptance Test Run Book and OSHA 29 CFR 1910.147 isolation requirements.',
  isActive: true,
  steps: SEED_STEPS,
};
