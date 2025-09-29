import { moderateText } from '@dotabod/profanity-filter'
import { logger } from '@dotabod/shared-utils'
import * as deepl from 'deepl-node'
import { franc } from 'franc'
import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../settings.js'
import { chatClient } from '../../../twitch/chatClient.js'
import { DotaEventTypes } from '../../../types.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { server } from '../../server.js'
import eventHandler from '../EventHandler.js'

const disableTranslation = false
const authKey = process.env.DEEPL_KEY || ''
const deeplClient = new deepl.DeepLClient(authKey)

// Chatting detection constants
const CHATTING_WORD_THRESHOLD = 10 // Minimum words to consider as "chatting"
const CHATTING_MESSAGE_THRESHOLD = 3 // Minimum messages within time window
const CHATTING_TIME_WINDOW = 5000 // 5 seconds in milliseconds
const CHATTING_COOLDOWN = 30000 // 30 seconds cooldown between "Chatting" messages
const disableChatterMessage = true // Disable chatting detection for now

// Track messages per player for chatting detection
interface PlayerMessage {
  timestamp: number
  wordCount: number
}

const playerMessages = new Map<string, PlayerMessage[]>()
const lastChattingMessage = new Map<string, number>()

type LanguageCodes =
  | 'en'
  | 'af-ZA'
  | 'ar-SA'
  | 'ca-ES'
  | 'cs-CZ'
  | 'da-DK'
  | 'de-DE'
  | 'el-GR'
  | 'es-ES'
  | 'fa-IR'
  | 'fi-FI'
  | 'fr-FR'
  | 'he-IL'
  | 'hu-HU'
  | 'it-IT'
  | 'ja-JP'
  | 'ko-KR'
  | 'nl-NL'
  | 'no-NO'
  | 'pl-PL'
  | 'pt-BR'
  | 'pt-PT'
  | 'ro-RO'
  | 'ru-RU'
  | 'sr-SP'
  | 'th-TH'
  | 'tl-PH'
  | 'sv-SE'
  | 'tr-TR'
  | 'uk-UA'
  | 'vi-VN'
  | 'zh-CN'
  | 'zh-TW'

function detectNonLatinCharacters(message: string): boolean {
  const hasCyrillic = /[\u0400-\u04FF]/.test(message)
  const hasArabic = /[\u0600-\u06FF]/.test(message)
  const hasChinese = /[\u4E00-\u9FFF]/.test(message)
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(message)
  const hasKorean = /[\uAC00-\uD7AF\u1100-\u11FF]/.test(message)
  return hasCyrillic || hasArabic || hasChinese || hasJapanese || hasKorean
}

function isLikelyEnglish(message: string): boolean {
  const englishWords =
    /\b(the|and|or|but|in|on|at|to|for|of|with|by|an|a|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|can|shall|this|that|these|those|here|there|where|when|why|how|what|who|which|all|some|any|every|most|many|much|few|little|no|not|yes|ok|okay|hi|hello|hey|bye|good|bad|big|small|long|short|hot|cold|new|old|high|low|right|wrong|true|false|first|last|next|now|then|soon|later|before|after|up|down|in|out|on|off|over|under|above|below|left|right|front|back|inside|outside|open|close|full|empty|fast|slow|easy|hard|quick|quickly|slowly|carefully|well|badly|better|best|worse|worst|more|most|less|least|many|much|few|little|some|any|every|all|no|none|nothing|something|anything|everything|everyone|someone|anyone|noone)\b/gi

  const wordCount = message.split(/\s+/).length
  const englishWordMatches = (message.match(englishWords) || []).length
  const englishRatio = wordCount > 0 ? englishWordMatches / wordCount : 0
  const hasNonLatinChars = detectNonLatinCharacters(message)

  return !hasNonLatinChars && englishRatio > 0.3 && /^[a-zA-Z\s\d.,!?\-'"()]+$/.test(message)
}

function normalizeText(text: string): string {
  return text
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize spaces
    .toLowerCase()
    .trim()
}

function shouldTriggerChattingAlert(
  clientName: string,
  playerId: number,
  wordCount: number,
): number {
  const compositeKey = `${clientName}-${playerId}`
  const now = Date.now()
  const messages = playerMessages.get(compositeKey) || []

  // Clean old messages outside the time window
  const recentMessages = messages.filter((msg) => now - msg.timestamp < CHATTING_TIME_WINDOW)
  recentMessages.push({ timestamp: now, wordCount })

  // Update stored messages
  playerMessages.set(compositeKey, recentMessages)

  // Check if we've sent a "Chatting" message recently
  const lastMessageTime = lastChattingMessage.get(compositeKey) || 0
  if (now - lastMessageTime < CHATTING_COOLDOWN) {
    return 0
  }

  // Check thresholds and calculate severity
  const messageCount = recentMessages.length
  const totalWords = recentMessages.reduce((sum, msg) => sum + msg.wordCount, 0)

  // Calculate severity based on message count and word count
  const messageSeverity = Math.floor(messageCount / CHATTING_MESSAGE_THRESHOLD)
  const wordSeverity = Math.floor(totalWords / CHATTING_WORD_THRESHOLD)
  const totalSeverity = messageSeverity + wordSeverity

  // Return number of "Chatting" messages to send (max 8)
  return Math.min(8, Math.max(0, totalSeverity))
}

function sendChattingAlert(dotaClient: any, playerId: number, count: number): void {
  const compositeKey = `${dotaClient.client.name}-${playerId}`
  const now = Date.now()
  lastChattingMessage.set(compositeKey, now)

  // Send "Chatting" multiple times based on severity
  for (let i = 0; i < count; i++) {
    chatClient.say(dotaClient.client.name, 'Chatting')
  }
}

eventHandler.registerEvent(`event:${DotaEventTypes.ChatMessage}`, {
  handler: async (
    dotaClient,
    event: {
      game_time: number
      player_id: number
      channel_type: number
      event_type: string
      message: string
    },
  ) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    const message = await moderateText(event.message?.trim())
    if (!message || typeof message !== 'string' || message === '***') {
      return
    }

    const wordCount = message.split(/\s+/).length

    // Check for chatting behavior
    if (!disableChatterMessage) {
      const chattingSeverity = shouldTriggerChattingAlert(
        dotaClient.client.name,
        event.player_id,
        wordCount,
      )
      if (chattingSeverity > 0) {
        sendChattingAlert(dotaClient, event.player_id, chattingSeverity)
      }
    }

    // Translation logic
    if (disableTranslation || !authKey) {
      return
    }

    // Check global chatter access
    const translateEnabled = getValueOrDefault(
      DBSettings.autoTranslate,
      dotaClient.client.settings,
      dotaClient.client.subscription,
    )

    if (!translateEnabled) return

    // Check global chatter access
    let toLanguage = getValueOrDefault(
      DBSettings.translationLanguage,
      dotaClient.client.settings,
      dotaClient.client.subscription,
    )
    if (toLanguage === 'en') toLanguage = 'en-US' // DeepL uses en-US instead of just en
    const typedLanguage = toLanguage as Omit<LanguageCodes, 'en'> & 'en-US'

    const detectedLang = franc(message, { minLength: 3 })
    const isEnglish = detectedLang === 'eng' || detectedLang === 'sco' // sco is Scots, very similar to English

    if (!isEnglish && !isLikelyEnglish(message) && detectedLang !== 'und') {
      try {
        const { text } = await deeplClient.translateText(message, null, typedLanguage)
        const moderatedTranslation = await moderateText(text)

        // Skip if translation is identical (case-insensitive, ignoring punctuation and extra spaces)
        const normalizedOriginal = normalizeText(message)
        const normalizedTranslation = normalizeText(text)

        if (normalizedTranslation === normalizedOriginal || normalizedTranslation.length < 3) {
          return
        }

        if (moderatedTranslation) {
          server.io.to(dotaClient.getToken()).emit('chatMessage', moderatedTranslation)
          chatClient.say(
            dotaClient.client.name,
            t('autoTranslate', {
              playerId: event.player_id,
              message: moderatedTranslation,
              lng: dotaClient.client.locale,
            }),
          )
        }
      } catch (error) {
        logger.error('[Translate] Error:', { error, message })
      }
    }
  },
})
