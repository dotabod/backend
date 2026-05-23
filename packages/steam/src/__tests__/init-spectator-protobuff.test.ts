import { describe, expect, it, vi } from 'vite-plus/test'
// @ts-expect-error no types
import Dota2 from 'dota2'
import { initSpectatorProtobuff } from '../initSpectatorProtobuff'

describe('initSpectatorProtobuff', () => {
  it('patches Dota2Client.prototype with spectateFriendGame and the response handler', () => {
    initSpectatorProtobuff()

    expect(typeof Dota2.Dota2Client.prototype.spectateFriendGame).toBe('function')

    const opcode = Dota2.schema.EDOTAGCMsg.k_EMsgGCSpectateFriendGameResponse
    expect(typeof Dota2.Dota2Client.prototype._handlers[opcode]).toBe('function')
  })

  it('spectateFriendGame returns null and does not call the GC when not ready', () => {
    initSpectatorProtobuff()
    const sendToGC = vi.fn(() => {})
    const ctx = { _gcReady: false, sendToGC }

    const result = Dota2.Dota2Client.prototype.spectateFriendGame.call(
      ctx,
      { steam_id: 123, live: true },
      () => {},
    )

    expect(result).toBeNull()
    expect(sendToGC).not.toHaveBeenCalled()
  })

  it('spectateFriendGame sends the spectate request to the GC when ready', () => {
    initSpectatorProtobuff()
    const sendToGC = vi.fn(() => {})
    const ctx = { _gcReady: true, sendToGC }

    Dota2.Dota2Client.prototype.spectateFriendGame.call(
      ctx,
      { steam_id: 123, live: true },
      () => {},
    )

    expect(sendToGC).toHaveBeenCalledTimes(1)
    // First arg is the spectate-friend-game opcode.
    expect(sendToGC.mock.calls[0][0]).toBe(Dota2.schema.EDOTAGCMsg.k_EMsgGCSpectateFriendGame)
  })
})
