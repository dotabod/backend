import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const upsert = vi.hoisted(() => vi.fn())

vi.mock('@dotabod/shared-utils', () => ({
  logger: { info: vi.fn() },
  supabase: {
    from: vi.fn(() => ({ upsert })),
  },
}))

const { recordGsiActivity, recordOverlaySocketActivity } = await import('../setupSignals')

describe('setup activity signals', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))
    upsert.mockReset()
    upsert.mockResolvedValue({ error: null })
  })

  it('records first-seen and last-seen when GSI activity first arrives', async () => {
    recordGsiActivity('gsi-user')
    await vi.runAllTimersAsync()

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'gsi_first_seen_at', userId: 'gsi-user' }),
      expect.objectContaining({ ignoreDuplicates: true }),
    )
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'gsi_last_seen_at', userId: 'gsi-user' }),
      expect.objectContaining({ ignoreDuplicates: false }),
    )
  })

  it('throttles repeated last-seen writes for the same GSI user', async () => {
    recordGsiActivity('throttled-gsi-user')
    recordGsiActivity('throttled-gsi-user')
    await vi.runAllTimersAsync()

    expect(upsert).toHaveBeenCalledTimes(2)
  })

  it('refreshes the overlay socket timestamp after the throttle window', async () => {
    recordOverlaySocketActivity('overlay-user')
    await vi.runAllTimersAsync()
    vi.setSystemTime(new Date('2026-09-04T12:01:01.000Z'))
    recordOverlaySocketActivity('overlay-user')
    await vi.runAllTimersAsync()

    const lastSeenWrites = upsert.mock.calls.filter(
      ([row]) => row.key === 'overlay_socket_last_seen_at',
    )
    expect(lastSeenWrites).toHaveLength(2)
  })
})
