// @ts-expect-error no types
import Dota2 from 'dota2'
import { describe, expect, it, vi } from 'vitest'

import { initSpectatorProtobuff } from '../init-spectator-protobuff'

describe(initSpectatorProtobuff, () => {
  it('patches Dota2Client.prototype with spectateFriendGame and the response handler', () => {
    initSpectatorProtobuff()

    expect(Dota2.Dota2Client.prototype.spectateFriendGame).toBeTypeOf('function')

    const opcode = Dota2.schema.EDOTAGCMsg.k_EMsgGCSpectateFriendGameResponse
    expect(Dota2.Dota2Client.prototype._handlers[opcode]).toBeTypeOf('function')
  })

  it('spectateFriendGame returns null and does not call the GC when not ready', () => {
    initSpectatorProtobuff()
    const sendToGC = vi.fn(() => {})
    const ctx = { _gcReady: false, sendToGC }

    const result = Dota2.Dota2Client.prototype.spectateFriendGame.call(
      ctx,
      { live: true, steam_id: 123 },
      () => {}
    )

    expect(result).toBeNull()
    expect(sendToGC).not.toHaveBeenCalled()
  })

  it('spectateFriendGame sends the spectate request to the GC when ready', () => {
    initSpectatorProtobuff()
    const sendToGC = vi.fn((..._args: unknown[]) => {})
    const ctx = { _gcReady: true, sendToGC }

    Dota2.Dota2Client.prototype.spectateFriendGame.call(
      ctx,
      { live: true, steam_id: 123 },
      () => {}
    )

    expect(sendToGC).toHaveBeenCalledOnce()
    // First arg is the spectate-friend-game opcode.
    expect(sendToGC.mock.calls[0][0]).toBe(Dota2.schema.EDOTAGCMsg.k_EMsgGCSpectateFriendGame)
  })
})
