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

export const SEED_STEPS: SeedStep[] = [
  {
    stepNumber: 1,
    title: 'NOTIFY',
    instruction:
      "Say out loud: 'Notifying operations P-204 going offline.' Then say 'DONE.'",
    referenceImageUrl: KIT_IMAGES.p204,
    verificationRequired: true,
    verificationPrompt:
      'Verify that the worker has acknowledged starting the lockout procedure. ' +
      'For a voice-acknowledged step, accept any photo as confirmation of attention.',
    successCriteria: 'Worker present and attending to the procedure.',
    retryThreshold: 3,
  },
  {
    stepNumber: 2,
    title: 'IDENTIFY THE SKID',
    instruction:
      "Stand in front of the wall. Look at the big P-204 banner. Say 'Hey Meta, take a picture and send to Field IQ.'",
    referenceImageUrl: KIT_IMAGES.p204,
    verificationRequired: true,
    verificationPrompt:
      'Confirm that the P-204 QR target banner is visible in the frame. ' +
      'The banner is white with the text "PUMP SKID P-204" and a QR code below.',
    successCriteria: 'P-204 banner identified.',
    retryThreshold: 3,
  },
  {
    stepNumber: 3,
    title: 'SHUTDOWN',
    instruction:
      "Pretend to press the local stop button on the (imaginary) panel. Say 'STOPPED.'",
    referenceImageUrl: KIT_IMAGES.p204,
    verificationRequired: true,
    verificationPrompt:
      'Verify that the worker has acknowledged stopping the equipment. ' +
      "For a voice-acknowledged step, accept any photo as confirmation.",
    successCriteria: 'Stop step acknowledged.',
    retryThreshold: 3,
  },
  {
    stepNumber: 4,
    title: 'IDENTIFY ELECTRICAL',
    instruction:
      "Look at the BR-204 target page on the wall. Say 'Hey Meta, take a picture and send to Field IQ.'",
    referenceImageUrl: KIT_IMAGES.br204,
    verificationRequired: true,
    verificationPrompt:
      'Confirm that the BR-204 (Electrical Disconnect) target page is the primary subject. ' +
      'The page has the title "BR-204 ELECTRICAL DISCONNECT" with a QR code.',
    successCriteria: 'BR-204 page identified.',
    retryThreshold: 3,
  },
  {
    stepNumber: 5,
    title: 'LOCKOUT THE BREAKER',
    instruction:
      "Pick up the red triangular breaker pin lockout (#4). Place it inside the marked square on the BR-204 page. Say 'Hey Meta, take a picture and send to Field IQ.'",
    referenceImageUrl: KIT_IMAGES[4],
    verificationRequired: true,
    verificationPrompt:
      'Confirm the photo shows component #4 (a red triangular circuit-breaker pin lockout) ' +
      'placed on the BR-204 target page. The component is small, distinctly red, ' +
      'and has a triangular footprint that fits inside the marked square on the page.',
    successCriteria: 'Breaker pin lockout placed on BR-204 target.',
    retryThreshold: 3,
  },
  {
    stepNumber: 6,
    title: 'IDENTIFY VALVE',
    instruction:
      "Look at the V-204 target page. Say 'Hey Meta, take a picture and send to Field IQ.'",
    referenceImageUrl: KIT_IMAGES.v204,
    verificationRequired: true,
    verificationPrompt:
      'Confirm that the V-204 (Process Water Gate Valve) target page is the primary subject. ' +
      'The page has the title "V-204 PROCESS WATER GATE VALVE" with a QR code.',
    successCriteria: 'V-204 page identified.',
    retryThreshold: 3,
  },
  {
    stepNumber: 7,
    title: 'LOCKOUT THE VALVE',
    instruction:
      "Pick up the yellow gate-valve lockout cover (#1). Place it inside the marked square on the V-204 page. Say 'Hey Meta, take a picture and send to Field IQ.'",
    referenceImageUrl: KIT_IMAGES[1],
    verificationRequired: true,
    verificationPrompt:
      'Confirm the photo shows component #1 (a large yellow cylindrical gate-valve lockout cover ' +
      'with prominent yellow body and a DANGER label) placed on or near the V-204 target page.',
    successCriteria: 'Yellow gate-valve cover placed on V-204 target.',
    retryThreshold: 3,
  },
  {
    stepNumber: 8,
    title: 'IDENTIFY PNEUMATIC',
    instruction:
      "Look at the PN-204 target page. Say 'Hey Meta, take a picture and send to Field IQ.'",
    referenceImageUrl: KIT_IMAGES.pn204,
    verificationRequired: true,
    verificationPrompt:
      'Confirm that the PN-204 (Pneumatic Control Plug) target page is the primary subject. ' +
      'The page has the title "PN-204 PNEUMATIC CONTROL PLUG" with a QR code.',
    successCriteria: 'PN-204 page identified.',
    retryThreshold: 3,
  },
  {
    stepNumber: 9,
    title: 'LOCKOUT THE PLUG',
    instruction:
      "Pick up the red plug lockout clamshell (#5). Close it over the marked square on the PN-204 page. Say 'Hey Meta, take a picture and send to Field IQ.'",
    referenceImageUrl: KIT_IMAGES[5],
    verificationRequired: true,
    verificationPrompt:
      'Confirm the photo shows component #5 (a red clamshell-style plug lockout, ' +
      'roughly circular with an internal cavity and multiple lock-hole tabs) ' +
      'placed on or near the PN-204 target page.',
    successCriteria: 'Plug lockout clamshell placed on PN-204 target.',
    retryThreshold: 3,
  },
  {
    stepNumber: 10,
    title: 'APPLY GROUP HASP',
    instruction:
      "Pick up the red multi-hole hasp (#7). Hook it through one of the lockout devices on the wall (the breaker pin is easiest). Say 'Hey Meta, take a picture and send to Field IQ.'",
    referenceImageUrl: KIT_IMAGES[7],
    verificationRequired: true,
    verificationPrompt:
      'Confirm the photo shows component #7 (a red multi-hole group lockout hasp ' +
      'with six padlock holes arranged in a row on each arm) physically engaged ' +
      'through one of the lockout devices already on the wall.',
    successCriteria: 'Hasp hooked through an installed lockout.',
    retryThreshold: 3,
  },
  {
    stepNumber: 11,
    title: 'PERSONAL LOCK + TAG',
    instruction:
      "Take the red ZING padlock (#8), close it through one of the hasp holes, remove the key, pocket it. Attach the DANGER tag (#9) next to the padlock. Say 'Hey Meta, take a picture and send to Field IQ.'",
    referenceImageUrl: KIT_IMAGES[8],
    verificationRequired: true,
    verificationPrompt:
      'Confirm the photo shows BOTH: (1) component #8 (a red ZING safety padlock with a ' +
      'black shackle, locked through one of the hasp holes) AND (2) component #9 ' +
      '(a DANGER tag, white with red DANGER banner reading "This energy source has been LOCKED OUT") ' +
      'attached at the same location. Both items must be visible to verify.',
    successCriteria: 'Personal padlock locked AND DANGER tag attached.',
    retryThreshold: 3,
  },
  {
    stepNumber: 12,
    title: 'VERIFY ZERO ENERGY',
    instruction:
      "Pretend to press the start button on the imaginary panel. Confirm nothing happens. Say 'ZERO.'",
    referenceImageUrl: KIT_IMAGES.p204,
    verificationRequired: true,
    verificationPrompt:
      'Verify zero-energy confirmation. The worker has attempted to start the equipment ' +
      'and observed no response, confirming the lockout is effective. Any photo of the ' +
      'completed lockout wall is acceptable as proof the worker is at the equipment.',
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
