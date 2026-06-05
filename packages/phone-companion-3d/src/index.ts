/**
 * @field-iq/phone-companion-3d — mobile 3D viewer for Field IQ.
 *
 * Core entry: types + the imperative viewer core + the framework-agnostic
 * component factories. Consumers should import from
 * `@field-iq/phone-companion-3d/react` or `/preact` to pick up pre-bound
 * `Viewer` and `PhoneSessionView` components.
 */
export * from './types.js';
export { buildGeometry, buildMaterial, buildMesh, disposeMesh } from './primitives.js';
export { loadScene, disposeScene, type LoadedScene, type Viewport } from './sceneLoader.js';
export { attachControls, type ControlsHandle, type ControlsOpts } from './controls.js';
export { createViewer, type ViewerHandle, type ViewerInit } from './viewerCore.js';
export { createViewerComponent, type CreateElement, type ViewerHooks } from './Viewer.js';
export { createPhoneSessionViewComponent, type PhoneSessionViewHooks } from './PhoneSessionView.js';
