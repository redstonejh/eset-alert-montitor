import { create } from 'zustand';

export const useStatusStore = create((set) => ({
  status: null,           // 'green' | 'yellow' | 'red' | null
  stage: null,            // null | 'process' | 'load' | 'scrape'
  detail: '',
  lastSuccess: null,      // ISO string
  checkedAt: null,        // ISO string
  connectionState: 'grey', // 'grey' | 'live' | 'black'
  popoverMode: 'expanded', // 'peek' | 'expanded' — default expanded so the popover
                           // never flashes the legacy peek view before main confirms

  setStatus: (payload) => set({
    status:      payload.status,
    stage:       payload.stage      ?? null,
    detail:      payload.detail     ?? '',
    lastSuccess: payload.lastSuccess ?? null,
    checkedAt:   payload.checkedAt  ?? null,
  }),

  setConnectionState: (connectionState) => set({ connectionState }),
  setPopoverMode: (popoverMode) => set({ popoverMode }),
}));

export const useSettingsStore = create((set) => ({
  esetRegion:      'us',
  esetUsername:    '',
  esetPassword:    '',
  esetBaseUrl:     '',
  esetAuthUrl:     '',
  pollIntervalSec: 60,
  lookbackHours:   24,

  setSettings: (s) => set({
    esetRegion:      s.esetRegion      || 'us',
    esetUsername:    s.esetUsername    || '',
    esetPassword:    s.esetPassword    || '',
    esetBaseUrl:     s.esetBaseUrl     || '',
    esetAuthUrl:     s.esetAuthUrl     || '',
    pollIntervalSec: s.pollIntervalSec || 60,
    lookbackHours:   s.lookbackHours   || 24,
  }),
}));
