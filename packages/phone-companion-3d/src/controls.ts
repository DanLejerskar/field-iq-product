/**
 * Purpose-built touch controls. Three.js's `OrbitControls` is example code
 * (not part of the npm `three` package), and we don't need its full surface;
 * what we want is a tiny module that does spherical orbit, pinch-zoom,
 * tap, and double-tap on a `<canvas>`.
 *
 * Orbit uses spherical coordinates around the scene origin. Pinch updates
 * the radius. A "tap" is a touch that moved less than TAP_SLOP px and ended
 * within TAP_MAX_MS; two taps within DOUBLE_TAP_MS trigger `onDoubleTap`.
 */
import * as THREE from 'three';

export interface ControlsHandle {
  /** Detach all listeners. */
  dispose(): void;
}

export interface ControlsOpts {
  /** Called for a single-tap (no drag, no pinch). */
  onTap?: (e: { clientX: number; clientY: number }) => void;
  /** Called for a double-tap. */
  onDoubleTap?: () => void;
  /** When this returns true, all input is ignored. */
  disabled?: () => boolean;
}

const ROT_SENSITIVITY = 0.005; // rad / px
const RADIUS_MIN = 0.5;
const RADIUS_MAX = 50;
const PHI_MIN = 0.05;
const PHI_MAX = Math.PI - 0.05;
const TAP_SLOP_PX = 5;
const TAP_MAX_MS = 300;
const DOUBLE_TAP_MS = 350;

interface PointerState {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

function cartesianToSpherical(position: THREE.Vector3): {
  theta: number;
  phi: number;
  radius: number;
} {
  const radius = position.length();
  if (radius === 0) return { theta: 0, phi: Math.PI / 2, radius: 0 };
  const phi = Math.acos(Math.min(1, Math.max(-1, position.y / radius)));
  const theta = Math.atan2(position.x, position.z);
  return { theta, phi, radius };
}

function applySpherical(
  camera: THREE.PerspectiveCamera,
  state: { theta: number; phi: number; radius: number },
): void {
  const sinPhi = Math.sin(state.phi);
  camera.position.set(
    state.radius * sinPhi * Math.sin(state.theta),
    state.radius * Math.cos(state.phi),
    state.radius * sinPhi * Math.cos(state.theta),
  );
  camera.lookAt(0, 0, 0);
}

export function attachControls(
  el: HTMLElement,
  camera: THREE.PerspectiveCamera,
  opts: ControlsOpts = {},
): ControlsHandle {
  const pointers = new Map<number, PointerState>();
  let lastTapAt = 0;

  let spherical = cartesianToSpherical(camera.position);

  // Pinch state across two pointers.
  let pinchStartDist = 0;
  let pinchStartRadius = 0;

  el.style.touchAction = 'none';

  function pointerDist(): number {
    if (pointers.size < 2) return 0;
    const arr = Array.from(pointers.values());
    const a = arr[0]!;
    const b = arr[1]!;
    return Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
  }

  function onPointerDown(e: PointerEvent): void {
    if (opts.disabled?.()) return;
    el.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
    });
    if (pointers.size === 2) {
      pinchStartDist = pointerDist();
      pinchStartRadius = spherical.radius;
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (opts.disabled?.()) return;
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.lastX;
    const dy = e.clientY - p.lastY;
    p.lastX = e.clientX;
    p.lastY = e.clientY;
    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > TAP_SLOP_PX) {
      p.moved = true;
    }

    if (pointers.size === 1) {
      // Single-finger orbit.
      spherical.theta -= dx * ROT_SENSITIVITY;
      spherical.phi -= dy * ROT_SENSITIVITY;
      if (spherical.phi < PHI_MIN) spherical.phi = PHI_MIN;
      if (spherical.phi > PHI_MAX) spherical.phi = PHI_MAX;
      applySpherical(camera, spherical);
    } else if (pointers.size === 2 && pinchStartDist > 0) {
      // Pinch zoom — change radius proportionally to the inverse of the
      // distance ratio.
      const dist = pointerDist();
      if (dist > 0) {
        const ratio = pinchStartDist / dist;
        let newRadius = pinchStartRadius * ratio;
        if (newRadius < RADIUS_MIN) newRadius = RADIUS_MIN;
        if (newRadius > RADIUS_MAX) newRadius = RADIUS_MAX;
        spherical.radius = newRadius;
        applySpherical(camera, spherical);
      }
    }
  }

  function endPointer(e: PointerEvent): void {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    el.releasePointerCapture?.(e.pointerId);
    if (pointers.size < 2) {
      pinchStartDist = 0;
      pinchStartRadius = 0;
    }
    if (opts.disabled?.()) return;
    if (!p) return;

    const dt = performance.now() - p.startTime;
    if (!p.moved && dt < TAP_MAX_MS && pointers.size === 0) {
      // Resync spherical from camera in case external code moved it.
      spherical = cartesianToSpherical(camera.position);

      const now = performance.now();
      if (now - lastTapAt < DOUBLE_TAP_MS) {
        lastTapAt = 0;
        opts.onDoubleTap?.();
      } else {
        lastTapAt = now;
        opts.onTap?.({ clientX: p.startX, clientY: p.startY });
      }
    }
  }

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', endPointer);
  el.addEventListener('pointercancel', endPointer);
  el.addEventListener('pointerleave', endPointer);

  return {
    dispose() {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endPointer);
      el.removeEventListener('pointercancel', endPointer);
      el.removeEventListener('pointerleave', endPointer);
      pointers.clear();
    },
  };
}
