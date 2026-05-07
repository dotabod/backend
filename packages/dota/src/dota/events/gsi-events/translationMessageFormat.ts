import { t } from 'i18next'

export function formatTranslatedSpeakerLabel(
  heroName: string,
  playerId: number,
  locale: string,
  isFallbackSpeakerLabel: boolean,
): string {
  if (isFallbackSpeakerLabel) {
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
