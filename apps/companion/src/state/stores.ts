/**
 * Zustand-flavoured wrappers around the pure stores. The pure modules are unit
 * tested; this file just plugs them into React + MMKV.
 */
import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import { ApiClient } from '../api/client';
import { UploadQueue } from '../api/queue';
import type { KvStorage } from '../api/storage';
import { AuthStore, type Principal } from '../auth/store';
import { initialMirror, reduce, type Action, type MirrorState } from './session';

const mmkv = new MMKV({ id: 'field-iq' });

const storage: KvStorage = {
  getString: (k) => mmkv.getString(k),
  set: (k, v) => mmkv.set(k, v),
  delete: (k) => mmkv.delete(k),
};

export const authStore = new AuthStore(storage);
export const uploadQueue = new UploadQueue(storage);

const apiHost = process.env.EXPO_PUBLIC_API_HOST ?? 'http://localhost:3000';
const wsHost = process.env.EXPO_PUBLIC_WS_HOST ?? 'ws://localhost:3000';
export const env = { apiHost, wsHost };

export const api = new ApiClient(apiHost, () => authStore.current()?.jwt);

interface AuthSlice {
  principal: Principal | undefined;
  setPrincipal: (p: Principal | undefined) => void;
}

export const useAuth = create<AuthSlice>((set) => ({
  principal: authStore.current(),
  setPrincipal: (p) => {
    if (p) authStore.set(p);
    else authStore.clear();
    set({ principal: p });
  },
}));

interface MirrorSlice {
  state: MirrorState;
  dispatch: (action: Action) => void;
  reset: () => void;
}

export const useMirror = create<MirrorSlice>((set, get) => ({
  state: initialMirror,
  dispatch: (action) => set({ state: reduce(get().state, action) }),
  reset: () => set({ state: initialMirror }),
}));
