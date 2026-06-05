/**
 * Preact 10+ entry. Pre-binds `useVoiceInput` and `PushToTalk` to Preact.
 *
 * Usage:
 *   import { useVoiceInput, PushToTalk } from '@field-iq/worker-dialogue/preact';
 */
import { h } from 'preact';
import type { VNode } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { createPushToTalk, type PushToTalkProps } from './PushToTalk.js';
import { createUseVoiceInput } from './voice.js';

export * from './index.js';

export const useVoiceInput = createUseVoiceInput({ useState, useEffect, useCallback, useRef });

export const PushToTalk: (props: PushToTalkProps) => VNode = createPushToTalk<VNode>(
  h as never,
  { useState, useEffect, useCallback, useRef },
  useVoiceInput,
);
