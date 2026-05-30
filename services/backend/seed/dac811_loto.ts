/**
 * DAC #811 LOTO seed data.
 *
 * The 10 `verificationPrompt` strings are COPIED CHARACTER-FOR-CHARACTER from
 * vendor/colleague-early-specs/.../03_LOTO_Test_Case.md §4 (cross-checked against
 * VISION_TO_REALIZATION_SPEC.md §4). They must NOT be paraphrased. `dac811_loto.fidelity.test.ts`
 * extracts the prompts from the vendor markdown and asserts byte-equality with these.
 *
 * Tuning a prompt bumps the procedure version (1.0.0 → 1.0.1) and gets a commit note.
 *
 * Equipment + procedure records: 03_LOTO_Test_Case.md §§2-3.
 * Seed cast (per PHASE_1 prompt): trainee Maya Wu, trainer Carlos Romero, supervisor Priya Patel.
 */

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
  name: 'DAC #811 Lockout/Tagout Trainer',
  assetTag: 'DAC-811-01',
  qrCodeValue: 'EON-LOTO-DAC811-01',
  description:
    'Heavy-duty desktop training panel with fused disconnect box, local manual starter, three-drain manifold, three-way ball valves, in-line GFCI protector, and tank vent covers. Used for hands-on LOTO competency training and certification.',
  location: 'EON Training Bay 1',
  photoUrl: 's3://field-iq/seed/dac811_overview.jpg',
  metadata: {
    vendor: 'DAC Worldwide',
    model: '811',
    course_ref: '811-500',
    components: [
      'fused_disconnect_box',
      'local_manual_starter',
      'three_drain_manifold',
      'three_way_ball_valve_a',
      'three_way_ball_valve_b',
      'gfci',
      'tank_vent_cover_a',
      'tank_vent_cover_b',
    ],
  },
};

const REF = (file: string): string => `s3://field-iq/seed/dac811/${file}`;

export const SEED_STEPS: SeedStep[] = [
  {
    stepNumber: 1,
    title: 'DON PPE',
    instruction:
      'Put on safety glasses and gloves. Take a selfie-style photo of your face and hands.',
    referenceImageUrl: REF('ref_step01_ppe.jpg'),
    verificationRequired: true,
    verificationPrompt: `Look at this photo of a technician. Confirm BOTH of the following:
(1) Protective gloves are clearly visible on the technician's hands.
(2) Safety glasses are clearly visible on the technician's face.
Both must be present to verify. If either is absent, partially visible,
or ambiguous, return verified=false and ask for a retake showing both
gloves and safety glasses clearly.`,
    successCriteria: 'Gloves and safety glasses both clearly visible.',
    retryThreshold: 3,
  },
  {
    stepNumber: 2,
    title: 'IDENTIFY EQUIPMENT',
    instruction: 'Scan the QR code on the trainer baseplate. Photo the QR code.',
    referenceImageUrl: REF('ref_step02_qr.jpg'),
    verificationRequired: true,
    verificationPrompt: `Look at this photo. Confirm:
(1) A QR code is clearly visible in the frame.
(2) The QR code appears affixed to industrial equipment (visible baseplate,
    panel, or chassis around it), not held loose.
Return verified=true only if both are met.`,
    successCriteria: 'QR code visible and contextually mounted.',
    retryThreshold: 3,
  },
  {
    stepNumber: 3,
    title: 'IDENTIFY ENERGY SOURCES',
    instruction:
      'Point at each energy source: fused disconnect, manual starter, ball valves. Photo with all in frame.',
    referenceImageUrl: REF('ref_step03_energy.jpg'),
    verificationRequired: true,
    verificationPrompt: `Look at this photo of the DAC #811 LOTO trainer. Confirm that the photo
shows the trainer's primary energy-source components in a single frame:
the fused disconnect box (gray rectangular electrical enclosure, upper
left of typical layout), the local manual starter switch (smaller switch
enclosure), and at least one three-way ball valve (red or colored handle
on a piped manifold). The whole trainer panel should be in frame.
Return verified=true only if at least two of these three component types
are clearly visible.`,
    successCriteria: 'Wide shot showing electrical isolation point(s) and at least one valve.',
    retryThreshold: 3,
  },
  {
    stepNumber: 4,
    title: 'STOP THE EQUIPMENT',
    instruction: 'Press STOP on the local manual starter. Photo the starter close-up.',
    referenceImageUrl: REF('ref_step04_stop.jpg'),
    verificationRequired: true,
    verificationPrompt: `Look at this close-up photo of the local manual starter switch on the
DAC #811 trainer. Confirm:
(1) The starter switch is clearly visible.
(2) The switch appears to be in the OFF / STOPPED position
    (typically: pushbutton out, handle down, or indicator light OFF).
If the switch state is ambiguous or the photo shows it in RUN, return
verified=false with a one-sentence correction.`,
    successCriteria: 'Starter visibly in STOP/OFF position.',
    retryThreshold: 3,
  },
  {
    stepNumber: 5,
    title: 'OPEN DISCONNECT',
    instruction: 'Open the fused disconnect switch (handle DOWN). Photo close-up.',
    referenceImageUrl: REF('ref_step05_disconnect.jpg'),
    verificationRequired: true,
    verificationPrompt: `Look at this close-up photo of the fused disconnect box on the DAC #811
trainer. Confirm:
(1) The disconnect switch handle is clearly visible.
(2) The handle is in the OPEN/OFF position — for most industrial
    disconnects this means the handle is pointing DOWN or to the OFF
    label.
If the handle is in the UP/ON position, or the position is unclear,
return verified=false.`,
    successCriteria: 'Disconnect handle in OPEN position.',
    retryThreshold: 3,
  },
  {
    stepNumber: 6,
    title: 'APPLY HASP',
    instruction: "Install a lockout hasp through the disconnect's lockout point. Photo close-up.",
    referenceImageUrl: REF('ref_step06_hasp.jpg'),
    verificationRequired: true,
    verificationPrompt: `Look at this close-up photo of the fused disconnect box. Confirm:
(1) A lockout hasp (a metal scissor-like device with one or more padlock
    holes) is physically installed on the disconnect's lockout point.
(2) The hasp is positioned so that the disconnect handle cannot be moved
    back to the ON position.
If no hasp is visible, or the hasp is held nearby but not installed, or
the hasp does not appear to block the handle, return verified=false.`,
    successCriteria: 'Hasp installed and physically preventing reactivation.',
    retryThreshold: 3,
  },
  {
    stepNumber: 7,
    title: 'APPLY PADLOCK',
    instruction: 'Lock your personal padlock through the hasp. Photo close-up.',
    referenceImageUrl: REF('ref_step07_padlock.jpg'),
    verificationRequired: true,
    verificationPrompt: `Look at this close-up photo. Confirm:
(1) A padlock is visible, threaded through one of the holes in the
    lockout hasp installed on the disconnect.
(2) The padlock shackle is fully closed and engaged (locked), not open
    or merely hanging through.
If the padlock is missing, open, or not actually engaged through the
hasp, return verified=false.`,
    successCriteria: 'Padlock locked through hasp.',
    retryThreshold: 3,
  },
  {
    stepNumber: 8,
    title: 'CLOSE BALL VALVE',
    instruction:
      'Turn the three-way ball valve handle 90° to CLOSED (perpendicular to pipe). Photo close-up.',
    referenceImageUrl: REF('ref_step08_valve.jpg'),
    verificationRequired: true,
    verificationPrompt: `Look at this close-up photo of a ball valve on the DAC #811 trainer's
three-drain manifold. Confirm:
(1) The valve handle is clearly visible.
(2) The handle is perpendicular (approximately 90°) to the pipe axis —
    this is the CLOSED position for a standard ball valve.
If the handle is parallel to the pipe (OPEN), at an intermediate angle,
or its orientation is unclear, return verified=false.`,
    successCriteria: 'Valve handle perpendicular to pipe.',
    retryThreshold: 3,
  },
  {
    stepNumber: 9,
    title: 'ATTACH LOTO TAG',
    instruction:
      'Fill in tag (name + date) and attach it to the locked-out disconnect. Photo with tag readable.',
    referenceImageUrl: REF('ref_step09_tag.jpg'),
    verificationRequired: true,
    verificationPrompt: `Look at this photo. Confirm:
(1) A LOTO tag (typically red, orange, or yellow, with text such as
    "DO NOT OPERATE", "DANGER", or similar warning) is visible.
(2) The tag is physically attached to the locked-out equipment — either
    hung from the padlock, hasp, or the disconnect itself.
(3) The tag is oriented such that its warning message would be readable
    by another worker approaching the equipment.
If any of these are not met, return verified=false. You do not need to
verify the technician's handwritten name and date are legible — only
that the tag is attached and warning-side-out.`,
    successCriteria: 'LOTO tag attached, warning visible.',
    retryThreshold: 3,
  },
  {
    stepNumber: 10,
    title: 'VERIFY ZERO ENERGY',
    instruction:
      'Press START on the local starter. It must NOT activate. Photo your hand on the START button.',
    referenceImageUrl: REF('ref_step10_test.jpg'),
    verificationRequired: true,
    verificationPrompt: `Look at this photo. The technician is performing a zero-energy
verification — attempting to start the equipment to confirm the
lockout is effective. Confirm:
(1) A hand is visible near or pressing the START button on the local
    manual starter.
(2) There is no indication that the equipment activated (no spinning
    pump impeller visible, no fluid motion in connected lines, no
    indicator light illuminated to GREEN/RUN if visible in frame).
If a hand is not visible on the start control, return verified=false.
If you can see clear evidence that the equipment DID activate (motion,
lit RUN indicator), return verified=false and flag this as a critical
safety failure in the detail field — the LOTO is not effective.`,
    successCriteria: 'Attempted start; no equipment response.',
    retryThreshold: 3,
  },
];

export const SEED_PROCEDURE: SeedProcedure = {
  name: 'LOTO Procedure for DAC #811 Trainer',
  version: '1.0.0',
  description:
    'Ten-step LOTO procedure derived from DAC Course 811-500 Exercises E811-S01 through E811-S04, adapted for the DAC #811 trainer with photo-verified compliance at each step. Aligned to OSHA 29 CFR 1910.147 requirements: identify hazardous energy, notify, isolate, lock, tag, and verify zero energy.',
  isActive: true,
  steps: SEED_STEPS,
};
