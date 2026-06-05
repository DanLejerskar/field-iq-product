/**
 * Framework-agnostic Viewer component factory.
 *
 * Renders a `<canvas>` that fills its parent and owns a single `ViewerHandle`
 * through its lifetime. On `scene` prop change the handle's `setScene` is
 * called — no Three.js teardown happens between renders. On unmount the
 * handle is fully disposed.
 *
 * Same factory shape as ModeToggle / PushToTalk — takes a `createElement`
 * and a hook bundle so the compiled JS works in both React and Preact.
 */
import { createViewer, type ViewerHandle } from './viewerCore.js';
import type { ViewerProps } from './types.js';

export type CreateElement<E> = (
  type: string,
  props: Record<string, unknown> | null,
  ...children: Array<E | string | number | null | undefined | boolean>
) => E;

export interface ViewerHooks {
  useEffect: (effect: () => void | (() => void), deps?: ReadonlyArray<unknown>) => void;
  useRef: <T>(initial: T) => { current: T };
}

const CANVAS_STYLE: Record<string, unknown> = {
  width: '100%',
  height: '100%',
  display: 'block',
  touchAction: 'none',
  outline: 'none',
};

export function createViewerComponent<E>(
  create: CreateElement<E>,
  hooks: ViewerHooks,
): (props: ViewerProps) => E {
  return function Viewer(props: ViewerProps): E {
    const canvasRef = hooks.useRef<HTMLCanvasElement | null>(null);
    const handleRef = hooks.useRef<ViewerHandle | null>(null);

    // Mount: build the viewer once.
    hooks.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return undefined;
      handleRef.current = createViewer(canvas, {
        scene: props.scene,
        background: props.background,
        autoRotate: props.autoRotate,
        disabled: props.disabled,
        onComponentTap: props.onComponentTap,
      });
      return () => {
        handleRef.current?.dispose();
        handleRef.current = null;
      };
      // Intentionally empty deps — re-mounting the viewer per render would
      // throw away GPU state. Prop updates flow through the effects below.
    }, []);

    // Propagate prop changes.
    hooks.useEffect(() => {
      handleRef.current?.setScene(props.scene);
    }, [props.scene]);

    hooks.useEffect(() => {
      if (props.background !== undefined) {
        handleRef.current?.setBackground(props.background);
      }
    }, [props.background]);

    hooks.useEffect(() => {
      handleRef.current?.setAutoRotate(props.autoRotate ?? false);
    }, [props.autoRotate]);

    hooks.useEffect(() => {
      handleRef.current?.setDisabled(props.disabled ?? false);
    }, [props.disabled]);

    hooks.useEffect(() => {
      handleRef.current?.setOnComponentTap(props.onComponentTap);
    }, [props.onComponentTap]);

    return create('canvas', {
      ref: canvasRef,
      style: CANVAS_STYLE,
      'aria-label': '3D equipment viewer',
      role: 'img',
    });
  };
}
