/**
 * React 18+ entry. Pre-binds `useVoiceInput` and `PushToTalk` to React.
 *
 * Usage:
 *   import { useVoiceInput, PushToTalk } from '@field-iq/worker-dialogue/react';
 */
import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createPushToTalk, type PushToTalkProps } from './PushToTalk.js';
import { createUseVoiceInput } from './voice.js';

export * from './index.js';

export const useVoiceInput = createUseVoiceInput({ useState, useEffect, useCallback, useRef });

export const PushToTalk: (props: PushToTalkProps) => ReactElement = createPushToTalk<ReactElement>(
  createElement as never,
  { useState, useEffect, useCallback, useRef },
  useVoiceInput,
);
