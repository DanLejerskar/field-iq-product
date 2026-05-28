/**
 * Neural Band gesture abstraction.
 *
 * Dev:  keyboard → Enter = pinch, Escape = cancel, ArrowKeys = swipes.
 * Prod: the Meta AI app's app-injection layer dispatches custom events on the
 *       window — we listen for those names (still in developer preview, ~May
 *       2026) and fall back to keyboard if they don't arrive.
 */

export interface InputHandlers {
  onEnter: () => void; // index pinch
  onCancel: () => void; // middle pinch
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeUp: () => void;
  onSwipeDown: () => void;
}

const META_EVENTS: Record<string, keyof InputHandlers> = {
  'meta:gesture:pinch': 'onEnter',
  'meta:gesture:cancel': 'onCancel',
  'meta:gesture:swipe-left': 'onSwipeLeft',
  'meta:gesture:swipe-right': 'onSwipeRight',
  'meta:gesture:swipe-up': 'onSwipeUp',
  'meta:gesture:swipe-down': 'onSwipeDown',
};

const KEYS: Record<string, keyof InputHandlers> = {
  Enter: 'onEnter',
  Escape: 'onCancel',
  ArrowLeft: 'onSwipeLeft',
  ArrowRight: 'onSwipeRight',
  ArrowUp: 'onSwipeUp',
  ArrowDown: 'onSwipeDown',
};

export function attachInput(handlers: InputHandlers): () => void {
  const onKey = (ev: KeyboardEvent) => {
    const handler = KEYS[ev.key];
    if (!handler) return;
    ev.preventDefault();
    handlers[handler]();
  };
  const metaUnbinds: Array<() => void> = [];
  for (const [name, handler] of Object.entries(META_EVENTS)) {
    const fn = () => handlers[handler]();
    window.addEventListener(name, fn);
    metaUnbinds.push(() => window.removeEventListener(name, fn));
  }
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onKey);
    for (const u of metaUnbinds) u();
  };
}
