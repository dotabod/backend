import { describe, expect, it } from 'bun:test'
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
})
