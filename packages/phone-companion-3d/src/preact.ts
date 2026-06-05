/**
 * Preact 10+ entry. Pre-binds `Viewer` and `PhoneSessionView` to Preact.
 *
 * Usage:
 *   import { Viewer, PhoneSessionView } from '@field-iq/phone-companion-3d/preact';
 */
import { h } from 'preact';
import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { createPhoneSessionViewComponent } from './PhoneSessionView.js';
import { createViewerComponent } from './Viewer.js';
import type { PhoneSessionViewProps, ViewerProps } from './types.js';

export * from './index.js';

export const Viewer: (props: ViewerProps) => VNode = createViewerComponent<VNode>(h as never, {
  useEffect,
  useRef,
});

export const PhoneSessionView: (props: PhoneSessionViewProps) => VNode =
  createPhoneSessionViewComponent<VNode>(h as never, { useEffect, useRef, useState }, Viewer);
