import { type BaseBetHandler, BetType } from './BetType'

// import { WinLossBetHandler } from './WinLossBetHandler'

// Factory functions to handle different bet types
const handlers: Record<BetType, BaseBetHandler | undefined> = {
  [BetType.WIN_LOSS]: undefined, // TODO: Will implement later
  [BetType.FIRST_TOWER]: undefined, // TODO: Will implement later
  [BetType.STREAMER_TP_LOCATION]: undefined, // TODO: Will implement later
  [BetType.DIE_BEFORE_MINUTE]: undefined, // TODO: Will implement later
  [BetType.ROSH_DEATH_TIME]: undefined, // TODO: Will implement later
  [BetType.FIRST_ROSH_TEAM]: undefined, // TODO: Will implement later
  [BetType.FIRST_BLOOD]: undefined, // TODO: Will implement later
  [BetType.ITEM_TIMING]: undefined, // TODO: Will implement later
  [BetType.CS_BY_MINUTE]: undefined, // TODO: Will implement later
  [BetType.KDA_BY_MINUTE]: undefined, // TODO: Will implement later
  [BetType.BUILDING_DESTROYED_BY_MINUTE]: undefined, // TODO: Will implement later
  [BetType.GAME_DURATION]: undefined, // TODO: Will implement later
}

/**
 * Gets the appropriate bet handler for the given bet type
 * @param type The type of bet to get a handler for
 * @returns The bet handler for the given type
 * @throws Error if the bet type is not implemented
 */
export function getHandler(type: BetType): BaseBetHandler {
  const handler = handlers[type]

  if (!handler) {
    throw new Error(`Bet type ${type} is not implemented yet.`)
  }

  return handler
}

/**
 * Gets all available bet handlers
 * @returns Array of implemented bet handlers
 */
export function getAvailableHandlers(): BaseBetHandler[] {
  return Object.values(handlers).filter((handler): handler is BaseBetHandler => Boolean(handler))
}
