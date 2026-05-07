const TRANSLATED_CHAT_PREFIX = '[In-game chat translation]'
const TRANSLATED_CHAT_SUFFIX = '(auto-translated, may be inaccurate)'

export function formatTranslatedSpeakerLabel(heroName: string, playerId: number): string {
  if (heroName === `Hero ${playerId}` || heroName === playerId.toString()) {
    return `Player ${playerId}`
  }
  return `${heroName} (P${playerId})`
}

export function formatTranslatedInGameChatMessage(message: string): string {
  return `${TRANSLATED_CHAT_PREFIX} ${message} ${TRANSLATED_CHAT_SUFFIX}`
}
