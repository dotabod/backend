// Keys for per-user setting rows written once on first occurrence.
// Mirrored in /Users/matt/Documents/github/frontend/src/lib/setupSignalKeys.ts —
// changes here require a matching change there.
export const SETUP_SIGNAL_KEYS = {
  gsi: 'gsi_first_seen_at',
  overlay: 'overlay_first_seen_at',
} as const

export type SetupSignalKey = (typeof SETUP_SIGNAL_KEYS)[keyof typeof SETUP_SIGNAL_KEYS]
