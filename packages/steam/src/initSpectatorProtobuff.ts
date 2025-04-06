// @ts-expect-error no types
import Dota2 from 'dota2'
import type { Long } from 'mongodb'
import { logger } from './utils/logger.js'

function onGCSpectateFriendGameResponse(message: any, callback: any) {
  const response: { server_steamid: Long; watch_live_result: number } =
    Dota2.schema.CMsgSpectateFriendGameResponse.decode(message)
  if (callback !== undefined) {
    callback(response)
  }
}

export function initSpectatorProtobuff() {
  Dota2.Dota2Client.prototype.spectateFriendGame = function (
    friend: { steam_id: number; live: boolean },
    callback: any,
  ) {
    const localCallback = callback || null
    if (!this._gcReady) {
      logger.info("[STEAM] GC not ready, please listen for the 'ready' event.")
      return null
    }
    // CMsgSpectateFriendGame
    const payload = new Dota2.schema.CMsgSpectateFriendGame(friend)
    this.sendToGC(
      Dota2.schema.EDOTAGCMsg.k_EMsgGCSpectateFriendGame,
      payload,
      onGCSpectateFriendGameResponse,
      localCallback,
    )
  }
  Dota2.Dota2Client.prototype._handlers[
    Dota2.schema.EDOTAGCMsg.k_EMsgGCSpectateFriendGameResponse
  ] = onGCSpectateFriendGameResponse
}
