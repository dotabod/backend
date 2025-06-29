import { type BaseBetHandler, BetType } from './BetType.js'

// import { WinLossBetHandler } from './WinLossBetHandler.js'

// Factory functions to handle different bet types
const handlers: Record<BetType, BaseBetHandler> = {
  [BetType.WIN_LOSS]: undefined as unknown as BaseBetHandler, // TODO: Will implement later
  [BetType.FIRST_TOWER]: undefined as unknown as BaseBetHandler, // TODO: Will implement later
  [BetType.STREAMER_TP_LOCATION]: undefined as unknown as BaseBetHandler, // TODO: Will implement later
  [BetType.DIE_BEFORE_MINUTE]: undefined as unknown as BaseBetHandler, // TODO: Will implement later
  [BetType.ROSH_DEATH_TIME]: undefined as unknown as BaseBetHandler, // TODO: Will implement later
  [BetType.FIRST_ROSH_TEAM]: undefined as unknown as BaseBetHandler, // TODO: Will implement later
  [BetType.FIRST_BLOOD]: undefined as unknown as BaseBetHandler, // TODO: Will implement later
  [BetType.ITEM_TIMING]: undefined as unknown as BaseBetHandler, // TODO: Will implement later
  [BetType.CS_BY_MINUTE]: undefined as unknown as BaseBetHandler, // TODO: Will implement later
  [BetType.KDA_BY_MINUTE]: undefined as unknown as BaseBetHandler, // TODO: Will implement later
  [BetType.BUILDING_DESTROYED_BY_MINUTE]: undefined as unknown as BaseBetHandler, // TODO: Will implement later
  [BetType.GAME_DURATION]: undefined as unknown as BaseBetHandler, // TODO: Will implement later
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
  return Object.values(handlers).filter(Boolean)
}
