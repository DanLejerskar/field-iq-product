/**
 * The 10 DAC #811 LOTO steps for the demo.
 *
 * `verificationPrompt` is verbatim from 03_LOTO_Test_Case.md §4. `verdictMessage`
 * is the one-line "what Claude says back" string from VISION_TO_REALIZATION_SPEC.md
 * §4 (the REALIZATION block on each step) — these are the strings the dashboard
 * + glasses HUD show when a verdict lands.
 */
import { PHOTO_DATA_URIS } from './photos.js';

export interface MockStep {
  stepNumber: number;
  title: string;
  instruction: string;
  verificationPrompt: string;
  verdictMessage: string;
  verdictDetail: string;
  photoDataUri: string;
}

export const STEPS: MockStep[] = [
  {
    stepNumber: 1,
    title: 'DON PPE',
    instruction:
      'Put on safety glasses and gloves. Take a selfie-style photo of your face and hands.',
    verificationPrompt: `Look at this photo of a technician. Confirm BOTH of the following:
(1) Protective gloves are clearly visible on the technician's hands.
(2) Safety glasses are clearly visible on the technician's face.
Both must be present to verify. If either is absent, partially visible,
or ambiguous, return verified=false and ask for a retake showing both
gloves and safety glasses clearly.`,
    verdictMessage: 'Gloves and safety glasses both visible.',
    verdictDetail:
      'Standard nitrile gloves on both hands, polycarbonate safety glasses on face. Confidence high.',
    photoDataUri: PHOTO_DATA_URIS[0]!,
  },
  {
    stepNumber: 2,
    title: 'IDENTIFY EQUIPMENT',
    instruction: 'Scan the QR code on the trainer baseplate. Photo the QR code.',
    verificationPrompt: `Look at this photo. Confirm:
(1) A QR code is clearly visible in the frame.
(2) The QR code appears affixed to industrial equipment (visible baseplate,
    panel, or chassis around it), not held loose.
Return verified=true only if both are met.`,
    verdictMessage: 'QR code visible, mounted on baseplate.',
    verdictDetail: 'EON-LOTO-DAC811-01 resolved to DAC #811 Trainer in EON Training Bay 1.',
    photoDataUri: PHOTO_DATA_URIS[1]!,
  },
  {
    stepNumber: 3,
    title: 'IDENTIFY ENERGY SOURCES',
    instruction:
      'Point at each energy source: fused disconnect, manual starter, ball valves. Photo with all in frame.',
    verificationPrompt: `Look at this photo of the DAC #811 LOTO trainer. Confirm that the photo
shows the trainer's primary energy-source components in a single frame:
the fused disconnect box (gray rectangular electrical enclosure, upper
left of typical layout), the local manual starter switch (smaller switch
enclosure), and at least one three-way ball valve (red or colored handle
on a piped manifold). The whole trainer panel should be in frame.
Return verified=true only if at least two of these three component types
are clearly visible.`,
    verdictMessage: 'Disconnect, starter, and ball valve all in frame.',
    verdictDetail: 'All three primary energy-source component types identified in a single shot.',
    photoDataUri: PHOTO_DATA_URIS[2]!,
  },
  {
    stepNumber: 4,
    title: 'STOP THE EQUIPMENT',
    instruction: 'Press STOP on the local manual starter. Photo the starter close-up.',
    verificationPrompt: `Look at this close-up photo of the local manual starter switch on the
DAC #811 trainer. Confirm:
(1) The starter switch is clearly visible.
(2) The switch appears to be in the OFF / STOPPED position
    (typically: pushbutton out, handle down, or indicator light OFF).
If the switch state is ambiguous or the photo shows it in RUN, return
verified=false with a one-sentence correction.`,
    verdictMessage: 'Starter visibly in STOP position.',
    verdictDetail: 'Pushbutton out, indicator light off. Switch confirmed STOPPED.',
    photoDataUri: PHOTO_DATA_URIS[3]!,
  },
  {
    stepNumber: 5,
    title: 'OPEN DISCONNECT',
    instruction: 'Open the fused disconnect switch (handle DOWN). Photo close-up.',
    verificationPrompt: `Look at this close-up photo of the fused disconnect box on the DAC #811
trainer. Confirm:
(1) The disconnect switch handle is clearly visible.
(2) The handle is in the OPEN/OFF position — for most industrial
    disconnects this means the handle is pointing DOWN or to the OFF
    label.
If the handle is in the UP/ON position, or the position is unclear,
return verified=false.`,
    verdictMessage: 'Disconnect handle in OPEN position.',
    verdictDetail: 'Handle pointing DOWN to the OFF label. Disconnect confirmed open.',
    photoDataUri: PHOTO_DATA_URIS[4]!,
  },
  {
    stepNumber: 6,
    title: 'APPLY HASP',
    instruction: "Install a lockout hasp through the disconnect's lockout point. Photo close-up.",
    verificationPrompt: `Look at this close-up photo of the fused disconnect box. Confirm:
(1) A lockout hasp (a metal scissor-like device with one or more padlock
    holes) is physically installed on the disconnect's lockout point.
(2) The hasp is positioned so that the disconnect handle cannot be moved
    back to the ON position.
If no hasp is visible, or the hasp is held nearby but not installed, or
the hasp does not appear to block the handle, return verified=false.`,
    verdictMessage: 'Hasp installed; handle blocked from ON.',
    verdictDetail: 'Scissor-style hasp threaded through lockout point. Handle motion blocked.',
    photoDataUri: PHOTO_DATA_URIS[5]!,
  },
  {
    stepNumber: 7,
    title: 'APPLY PADLOCK',
    instruction: 'Lock your personal padlock through the hasp. Photo close-up.',
    verificationPrompt: `Look at this close-up photo. Confirm:
(1) A padlock is visible, threaded through one of the holes in the
    lockout hasp installed on the disconnect.
(2) The padlock shackle is fully closed and engaged (locked), not open
    or merely hanging through.
If the padlock is missing, open, or not actually engaged through the
hasp, return verified=false.`,
    verdictMessage: 'Padlock locked through hasp.',
    verdictDetail: 'Orange personal padlock, shackle closed and engaged.',
    photoDataUri: PHOTO_DATA_URIS[6]!,
  },
  {
    stepNumber: 8,
    title: 'CLOSE BALL VALVE',
    instruction:
      'Turn the three-way ball valve handle 90° to CLOSED (perpendicular to pipe). Photo close-up.',
    verificationPrompt: `Look at this close-up photo of a ball valve on the DAC #811 trainer's
three-drain manifold. Confirm:
(1) The valve handle is clearly visible.
(2) The handle is perpendicular (approximately 90°) to the pipe axis —
    this is the CLOSED position for a standard ball valve.
If the handle is parallel to the pipe (OPEN), at an intermediate angle,
or its orientation is unclear, return verified=false.`,
    verdictMessage: 'Valve handle perpendicular to pipe.',
    verdictDetail: 'Handle at 90° to pipe axis. Ball valve confirmed CLOSED.',
    photoDataUri: PHOTO_DATA_URIS[7]!,
  },
  {
    stepNumber: 9,
    title: 'ATTACH LOTO TAG',
    instruction:
      'Fill in tag (name + date) and attach it to the locked-out disconnect. Photo with tag readable.',
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
    verdictMessage: 'LOTO tag attached, warning-side-out.',
    verdictDetail: 'Red DANGER / DO NOT OPERATE tag hung from padlock; orientation correct.',
    photoDataUri: PHOTO_DATA_URIS[8]!,
  },
  {
    stepNumber: 10,
    title: 'VERIFY ZERO ENERGY',
    instruction:
      'Press START on the local starter. It must NOT activate. Photo your hand on the START button.',
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
    verdictMessage: 'Start attempted; equipment did NOT activate. Zero-energy verified.',
    verdictDetail:
      'Hand on START button visible. No motion, no RUN indicator. LOTO confirmed effective.',
    photoDataUri: PHOTO_DATA_URIS[9]!,
  },
];

/** Retry message shown when step 5 fails once in the demo timeline. */
export const STEP_5_RETRY_MESSAGE = 'Handle position unclear — retake with the OFF label visible.';

export const MOCK_PROCEDURE = {
  id: 'proc_loto_dac811_v1',
  name: 'LOTO Procedure for DAC #811 Trainer',
  version: '1.0.0',
};

export const MOCK_EQUIPMENT = {
  id: 'eq_dac811_001',
  name: 'DAC #811 Lockout/Tagout Trainer',
  assetTag: 'DAC-811-01',
  qrCodeValue: 'EON-LOTO-DAC811-01',
};

export const MOCK_ORG = { id: 'org_eon_demo', name: 'EON AI Ventures' };
export const MOCK_TRAINEE = { id: 'user_maya', fullName: 'Maya Wu', role: 'technician' as const };
export const MOCK_TRAINER = {
  id: 'user_carlos',
  fullName: 'Carlos Romero',
  role: 'trainer' as const,
};
