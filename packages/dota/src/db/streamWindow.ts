// Fallback window for session-scoped match queries when the stream isn't
// currently online (or `stream_start_date` is missing). 12 hours matches the
// longest realistic Dota streaming session and is shared by getWL,
// getTodayHeroStats, recent / unresolved / won / lost commands, and the
// retroactive match resolver.
const DEFAULT_STREAM_WINDOW_MS = 12 * 60 * 60 * 1000

export function getSessionStartDate(streamStartDate?: Date | null): Date {
  return streamStartDate ?? new Date(Date.now() - DEFAULT_STREAM_WINDOW_MS)
}
