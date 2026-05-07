import { t } from 'i18next'

export function formatTranslatedSpeakerLabel(
  heroName: string,
  playerId: number,
  locale: string,
): string {
  const fallbackSpeakerLabels = new Set([
    t('chatTranslation.legacyHeroLabel', {
      lng: locale,
      playerId,
    }),
    `${playerId}`,
  ])
  if (fallbackSpeakerLabels.has(heroName)) {
    return t('chatTranslation.playerLabel', {
      lng: locale,
      playerId,
    })
  }
  return t('chatTranslation.speakerLabel', {
    lng: locale,
    heroName,
    playerId,
  })
}

export function formatTranslatedInGameChatMessage(message: string, locale: string): string {
  return t('chatTranslation.message', {
    lng: locale,
    message,
  })
}
