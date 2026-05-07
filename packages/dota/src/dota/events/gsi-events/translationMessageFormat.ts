import { t } from 'i18next'

const TWITCH_CHAT_LIMIT = 500
const MERGED_PART_SEPARATOR = ' | '
const TRUNCATION_SUFFIX = '…'

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

function isWithinTranslatedLimit(message: string, locale: string, maxLength: number): boolean {
  return formatTranslatedInGameChatMessage(message, locale).length <= maxLength
}

function truncateToLimit(message: string, locale: string, maxLength: number): string {
  if (isWithinTranslatedLimit(message, locale, maxLength)) {
    return message
  }

  let left = 0
  let right = message.length
  let best = ''

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const candidate = `${message.slice(0, mid)}${TRUNCATION_SUFFIX}`

    if (isWithinTranslatedLimit(candidate, locale, maxLength)) {
      best = candidate
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  if (best) {
    return best
  }

  return isWithinTranslatedLimit(TRUNCATION_SUFFIX, locale, maxLength) ? TRUNCATION_SUFFIX : ''
}

export function formatTranslatedInGameChatMessages(
  mergedMessage: string,
  locale: string,
  maxLength = TWITCH_CHAT_LIMIT,
): string[] {
  const parts = mergedMessage.split(MERGED_PART_SEPARATOR)
  const chunks: string[] = []
  let currentChunk = ''

  for (const part of parts) {
    const candidate = currentChunk ? `${currentChunk}${MERGED_PART_SEPARATOR}${part}` : part
    if (isWithinTranslatedLimit(candidate, locale, maxLength)) {
      currentChunk = candidate
      continue
    }

    if (currentChunk) {
      chunks.push(currentChunk)
    }

    currentChunk = truncateToLimit(part, locale, maxLength)
  }

  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks.map((chunk) => formatTranslatedInGameChatMessage(chunk, locale))
}
