/**
 * Imperative viewer core. Framework-agnostic — the Viewer / PhoneSessionView
 * factories below just bind this to a runtime's createElement + hooks.
 *
 * Headless mode: when WebGLRenderer construction throws (jsdom — no WebGL
 * support, or an old browser missing the context), the viewer installs a
 * no-op renderer so unit tests can construct + dispose without crashing.
 * Picking still works because the raycaster doesn't need a GL context.
 */
import * as THREE from 'three';
import type { SceneManifest } from '@field-iq/genesis-bridge';
import { attachControls, type ControlsHandle } from './controls.js';
import { disposeScene, loadScene, type LoadedScene } from './sceneLoader.js';
import { EON_NAVY_BG } from './types.js';

export interface ViewerInit {
  scene: SceneManifest;
  background?: string;
  onComponentTap?: (id: string | null) => void;
  autoRotate?: boolean;
  disabled?: boolean;
}

export interface ViewerHandle {
  setScene(manifest: SceneManifest): void;
  setBackground(color: string): void;
  setAutoRotate(rotate: boolean): void;
  setDisabled(disabled: boolean): void;
  setOnComponentTap(cb: ((id: string | null) => void) | undefined): void;
  /** Public raycast — returns the hit componentId or null. */
  pickAt(clientX: number, clientY: number): string | null;
  /** True when running without WebGL (jsdom / old browsers). */
  readonly isHeadless: boolean;
  dispose(): void;
}

interface RendererLike {
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(value: number): void;
  dispose(): void;
  readonly domElement: HTMLCanvasElement;
}

function noopRenderer(canvas: HTMLCanvasElement): RendererLike {
  return {
    render() {
      /* no-op */
    },
    setSize() {
      /* no-op */
    },
    setPixelRatio() {
      /* no-op */
    },
    dispose() {
      /* no-op */
    },
    domElement: canvas,
  };
}

function buildRenderer(canvas: HTMLCanvasElement): { renderer: RendererLike; headless: boolean } {
  try {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    return { renderer: r as unknown as RendererLike, headless: false };
  } catch {
    return { renderer: noopRenderer(canvas), headless: true };
  }
}

function viewportOf(canvas: HTMLCanvasElement): { width: number; height: number } {
  const rect =
    typeof canvas.getBoundingClientRect === 'function'
      ? canvas.getBoundingClientRect()
      : { width: canvas.width, height: canvas.height };
  return {
    width: Math.max(1, Math.floor(rect.width || canvas.width || 800)),
    height: Math.max(1, Math.floor(rect.height || canvas.height || 600)),
  };
}

export function createViewer(canvas: HTMLCanvasElement, init: ViewerInit): ViewerHandle {
  const { renderer, headless } = buildRenderer(canvas);
  const viewport = viewportOf(canvas);
  if (!headless) {
    renderer.setSize(viewport.width, viewport.height, false);
    renderer.setPixelRatio(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  }

  let loaded: LoadedScene = loadScene(init.scene, viewport);
  loaded.scene.background = new THREE.Color(init.background ?? EON_NAVY_BG);

  let autoRotate = init.autoRotate ?? false;
  let disabled = init.disabled ?? false;
  let onComponentTap = init.onComponentTap;
  let rafId: number | null = null;

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  function pickAt(clientX: number, clientY: number): string | null {
    const rect =
      typeof canvas.getBoundingClientRect === 'function'
        ? canvas.getBoundingClientRect()
        : { left: 0, top: 0, width: canvas.width, height: canvas.height };
    const w = rect.width || canvas.width || 1;
    const h = rect.height || canvas.height || 1;
    const x = ((clientX - rect.left) / w) * 2 - 1;
    const y = -(((clientY - rect.top) / h) * 2 - 1);
    pointerNdc.set(x, y);
    // Defensive: controls may have moved the camera and setScene may have
    // installed fresh meshes whose matrixWorld hasn't been flushed yet. In
    // headless mode there's no render call to push the update, so do it
    // explicitly here.
    loaded.camera.updateMatrixWorld(true);
    loaded.scene.updateMatrixWorld(true);
    raycaster.setFromCamera(pointerNdc, loaded.camera);

    const meshes = Array.from(loaded.meshByComponentId.values());
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    return resolveComponentId(hits[0]!.object);
  }

  const controls: ControlsHandle = attachControls(canvas, loaded.camera, {
    onTap: ({ clientX, clientY }) => {
      if (disabled || !onComponentTap) return;
      onComponentTap(pickAt(clientX, clientY));
    },
    onDoubleTap: () => {
      if (disabled) return;
      // Reset camera to manifest defaults.
      loaded.camera.position.set(
        init.scene.camera.position[0],
        init.scene.camera.position[1],
        init.scene.camera.position[2],
      );
      loaded.camera.lookAt(
        init.scene.camera.target[0],
        init.scene.camera.target[1],
        init.scene.camera.target[2],
      );
    },
    disabled: () => disabled,
  });

  function tick(): void {
    if (autoRotate) loaded.root.rotation.y += 0.005;
    renderer.render(loaded.scene, loaded.camera);
    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(tick);
    }
  }

  if (typeof requestAnimationFrame === 'function') {
    rafId = requestAnimationFrame(tick);
  }

  let disposed = false;

  return {
    get isHeadless(): boolean {
      return headless;
    },
    setScene(manifest: SceneManifest): void {
      const next = loadScene(manifest, viewportOf(canvas));
      next.scene.background = loaded.scene.background;
      disposeScene(loaded);
      loaded = next;
    },
    setBackground(color: string): void {
      loaded.scene.background = new THREE.Color(color);
    },
    setAutoRotate(rotate: boolean): void {
      autoRotate = rotate;
    },
    setDisabled(d: boolean): void {
      disabled = d;
    },
    setOnComponentTap(cb): void {
      onComponentTap = cb;
    },
    pickAt,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      controls.dispose();
      disposeScene(loaded);
      renderer.dispose();
    },
  };
}

function resolveComponentId(obj: THREE.Object3D): string | null {
  let node: THREE.Object3D | null = obj;
  while (node) {
    const id = (node.userData as { componentId?: unknown }).componentId;
    if (typeof id === 'string') return id;
    node = node.parent;
  }
  return null;
}
