/**
 * React 18+ entry. Pre-binds `Viewer` and `PhoneSessionView` to React.
 *
 * Usage:
 *   import { Viewer, PhoneSessionView } from '@field-iq/phone-companion-3d/react';
 */
import { createElement, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createPhoneSessionViewComponent } from './PhoneSessionView.js';
import { createViewerComponent } from './Viewer.js';
import type { PhoneSessionViewProps, ViewerProps } from './types.js';

export * from './index.js';

export const Viewer: (props: ViewerProps) => ReactElement = createViewerComponent<ReactElement>(
  createElement as never,
  { useEffect, useRef },
);

export const PhoneSessionView: (props: PhoneSessionViewProps) => ReactElement =
  createPhoneSessionViewComponent<ReactElement>(
    createElement as never,
    { useEffect, useRef, useState },
    Viewer,
  );
