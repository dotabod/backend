import { profanity } from '@2toad/profanity'
import axios from 'axios'
import { Filter } from 'bad-words'
import { detect } from 'curse-filter'
import leoProfanity from 'leo-profanity'
import naughtyWords from 'naughty-words'
import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity'
import profanityUtil from 'profanity-util'
import { flatWords as russianBadWordsList } from 'russian-bad-words'
import wash from 'washyourmouthoutwithsoap'

import {
  detectAgeRestrictions,
  detectEvasionTactics,
  detectRussianProfanity,
  detectTransphobicContent,
} from './profanity-wordlists'
import { createTextVariations } from './text-normalization'

interface ModerationResponse {
  id: string
  model: string
  results: {
    flagged: boolean
    categories: {
      [key: string]: boolean
    }
    category_scores: {
      [key: string]: number
    }
  }[]
}

export interface ProfanityDetails {
  isFlagged: boolean
  source: string
  matches?: string[]
  language?: string
}

export interface TextProfanityDetails extends ProfanityDetails {
  text: string
}

interface WashProfanityResult {
  detected: boolean
  locale?: string
  matchingWords?: string[]
}

const HATE_SPEECH_SOURCE = 'hate-speech'

const badWords = new Filter()

// Initialize leo-profanity with only English and Russian dictionaries
leoProfanity.loadDictionary('en')
leoProfanity.loadDictionary('ru')

leoProfanity.add(russianBadWordsList)

// Get only English and Russian locales from washyourmouthoutwithsoap
const allSupportedLocales = wash.supported()
const supportedLocales = allSupportedLocales.filter(
  (locale) => locale.startsWith('en') || locale.startsWith('ru')
)

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
})

/**
 * Whitelist of words that might be falsely detected as profanity
 * but should be allowed as legitimate language
 */
const SAFE_WORDS_WHITELIST = [
  // Common English words falsely flagged
  'classic',
  'scunthorpe',
  'assassin',
  'cockpit',
  'shuttlecock',
  'analysis',
  'grape',
  'therapist',
  'competition',
  'intense',
  'skill',
  'set',
  'cocktail',
  'documentation',
]

const isSafeText = function isSafeText(text: string): boolean {
  const lower = text.toLowerCase()

  if (SAFE_WORDS_WHITELIST.some((word) => lower.includes(word.toLowerCase()))) {
    return true
  }

  // Special case for 'fakejoker' which is getting false positives
  if (lower === 'fakejoker') {
    return true
  }

  const words = lower.split(/\s+/u)
  const allWordsAreSafe = words.every((word) => {
    const cleanWord = word.replaceAll(/[.,?!;:'"()[\]{}]/gu, '')
    return cleanWord.length === 0 || SAFE_WORDS_WHITELIST.includes(cleanWord)
  })

  return allWordsAreSafe
}

const checkRussianBadWords = function checkRussianBadWords(text: string): boolean {
  const lowerText = text.toLowerCase()
  return russianBadWordsList.some((word) => lowerText.includes(word.toLowerCase()))
}

const extractRussianBadWords = function extractRussianBadWords(text: string): string[] {
  const lowerText = text.toLowerCase()
  return russianBadWordsList.filter((word) => lowerText.includes(word.toLowerCase()))
}

const checkWashProfanity = function checkWashProfanity(text: string): WashProfanityResult {
  for (const locale of supportedLocales) {
    if (wash.check(locale, text)) {
      const wordList = wash.words(locale)

      // The actual words that matched using washyourmouthoutwithsoap's tokenize method
      const tokens = new Set([
        ...text
          .toLowerCase()
          .replaceAll(/[\s+]+/gu, ' ')
          .replace('/ {2,}/', ' ')
          .split(' '),
        ...text
          .toLowerCase()
          .replaceAll(/[^\w\s]/gu, '')
          .replace('/ {2,}/', ' ')
          .split(' '),
      ])

      const matchingWords = wordList.filter((word: string) => tokens.has(word.toLowerCase()))

      return {
        detected: true,
        locale,
        matchingWords: matchingWords.length > 0 ? matchingWords : undefined,
      }
    }
  }

  return { detected: false }
}

interface NaughtyWordsMatch {
  language: string
  words: string[]
}

const NAUGHTY_WORD_LANGUAGES = new Set(['en', 'ru'])

const findNaughtyWords = function findNaughtyWords(text: string): NaughtyWordsMatch | null {
  const lowerText = text.toLowerCase()
  for (const [language, wordList] of Object.entries(naughtyWords)) {
    if (!NAUGHTY_WORD_LANGUAGES.has(language)) {
      continue
    }

    const words = wordList.filter((word) => {
      if (word.length < 4) {
        return new RegExp(`\\b${word}\\b`, 'ui').test(text)
      }
      return lowerText.includes(word.toLowerCase())
    })
    if (words.length > 0) {
      return { language, words }
    }
  }
  return null
}

interface ProfanityDetailContext {
  lowerText: string
  text: string
  variations: string[]
}

type ProfanityDetailDetector = (context: ProfanityDetailContext) => ProfanityDetails | null

const getWashDetails = function getWashDetails({
  text,
}: ProfanityDetailContext): ProfanityDetails | null {
  try {
    const washResult = checkWashProfanity(text)
    return washResult.detected
      ? {
          isFlagged: true,
          language: washResult.locale,
          matches: washResult.matchingWords,
          source: 'washyourmouthoutwithsoap',
        }
      : null
  } catch (error) {
    console.error('Error using washyourmouthoutwithsoap library in details:', error)
    return null
  }
}

const getRussianBadWordsDetails = function getRussianBadWordsDetails({
  text,
}: ProfanityDetailContext): ProfanityDetails | null {
  try {
    if (!checkRussianBadWords(text)) {
      return null
    }
    const extracted = extractRussianBadWords(text)
    return {
      isFlagged: true,
      language: 'russian',
      matches: extracted.length > 0 ? extracted : undefined,
      source: 'russian-bad-words',
    }
  } catch (error) {
    console.error('Error using russian-bad-words library in details:', error)
    return null
  }
}

const getBadWordsDetails = function getBadWordsDetails({
  text,
}: ProfanityDetailContext): ProfanityDetails | null {
  try {
    return badWords.isProfane(text)
      ? {
          isFlagged: true,
          matches: text.split(' ').filter((word) => badWords.isProfane(word)),
          source: 'bad-words',
        }
      : null
  } catch (error) {
    console.error('Error using bad-words library in details:', error)
    return null
  }
}

const getLeoProfanityDetails = function getLeoProfanityDetails({
  text,
}: ProfanityDetailContext): ProfanityDetails | null {
  try {
    return leoProfanity.check(text)
      ? {
          isFlagged: true,
          matches: text.split(' ').filter((word) => leoProfanity.check(word)),
          source: 'leo-profanity',
        }
      : null
  } catch (error) {
    console.error('Error using leo-profanity library in details:', error)
    return null
  }
}

const getProfanityUtilDetails = function getProfanityUtilDetails({
  text,
}: ProfanityDetailContext): ProfanityDetails | null {
  try {
    const profanityScore = profanityUtil.check(text)
    return profanityScore[1] > 0
      ? { isFlagged: true, matches: profanityScore[0], source: 'profanity-util' }
      : null
  } catch (error) {
    console.error('Error using profanity-util library in details:', error)
    return null
  }
}

const getNaughtyWordsDetails = function getNaughtyWordsDetails({
  text,
}: ProfanityDetailContext): ProfanityDetails | null {
  try {
    const match = findNaughtyWords(text)
    return match === null
      ? null
      : {
          isFlagged: true,
          language: match.language,
          matches: match.words,
          source: 'naughty-words',
        }
  } catch (error) {
    console.error('Error using naughty-words library in details:', error)
    return null
  }
}

const findVariation = function findVariation(
  variations: readonly string[],
  detector: (variation: string) => boolean
): string | null {
  return variations.find((variation) => detector(variation)) ?? null
}

const getCurseFilterDetails = function getCurseFilterDetails({
  variations,
}: ProfanityDetailContext): ProfanityDetails | null {
  const variation = findVariation(variations, detect)
  return variation === null
    ? null
    : { isFlagged: true, matches: [variation], source: 'curse-filter' }
}

const getToadProfanityDetails = function getToadProfanityDetails({
  variations,
}: ProfanityDetailContext): ProfanityDetails | null {
  const variation = findVariation(variations, (candidate) => profanity.exists(candidate))
  return variation === null
    ? null
    : { isFlagged: true, matches: [variation], source: '@2toad/profanity' }
}

const getObscenityDetails = function getObscenityDetails({
  variations,
}: ProfanityDetailContext): ProfanityDetails | null {
  for (const variation of variations) {
    const matches = matcher.getAllMatches(variation)
    if (matches.length > 0) {
      return {
        isFlagged: true,
        matches: matches.map((match) => variation.slice(match.startIndex, match.endIndex)),
        source: 'obscenity',
      }
    }
  }
  return null
}

const transphobicTerms = [
  'transsexual',
  'transgender',
  'transvestite',
  'tranny',
  'shemale',
  'trans',
] as const

const getTransphobicDetails = function getTransphobicDetails({
  lowerText,
  text,
}: ProfanityDetailContext): ProfanityDetails | null {
  if (!detectTransphobicContent(text)) {
    return null
  }
  const matchedTerm = transphobicTerms.find((term) => lowerText.includes(term))
  return {
    isFlagged: true,
    matches: [matchedTerm ?? text],
    source: HATE_SPEECH_SOURCE,
  }
}

const getCustomRussianDetails = function getCustomRussianDetails({
  text,
}: ProfanityDetailContext): ProfanityDetails | null {
  return detectRussianProfanity(text)
    ? { isFlagged: true, language: 'russian', source: 'custom-wordlist' }
    : null
}

const getEvasionDetails = function getEvasionDetails({
  text,
}: ProfanityDetailContext): ProfanityDetails | null {
  return detectEvasionTactics(text) ? { isFlagged: true, source: 'evasion-tactics' } : null
}

const getAgeRestrictionDetails = function getAgeRestrictionDetails({
  text,
}: ProfanityDetailContext): ProfanityDetails | null {
  if (!detectAgeRestrictions(text)) {
    return null
  }
  const agePrefix = /\b(?:i'?m|i\s+am|iam|age)(?=\s|:|=|\d|$)/iu.exec(text)
  const ageSuffix = agePrefix === null ? null : text.slice(agePrefix.index + agePrefix[0].length)
  const ageMatch = ageSuffix === null || ageSuffix.length === 0 ? null : /^\D*\d+/u.exec(ageSuffix)
  const matchText =
    agePrefix !== null && ageMatch !== null
      ? text.slice(agePrefix.index, agePrefix.index + agePrefix[0].length + ageMatch[0].length)
      : text
  return { isFlagged: true, matches: [matchText], source: 'age-restriction' }
}

const profanityDetailDetectors = [
  getWashDetails,
  getRussianBadWordsDetails,
  getBadWordsDetails,
  getLeoProfanityDetails,
  getProfanityUtilDetails,
  getNaughtyWordsDetails,
  getCurseFilterDetails,
  getToadProfanityDetails,
  getObscenityDetails,
  getTransphobicDetails,
  getCustomRussianDetails,
  getEvasionDetails,
  getAgeRestrictionDetails,
] satisfies ProfanityDetailDetector[]

const findLocalProfanity = function findLocalProfanity(text: string): ProfanityDetails | null {
  const context = {
    lowerText: text.toLowerCase(),
    text,
    variations: createTextVariations(text),
  }
  for (const detector of profanityDetailDetectors) {
    const details = detector(context)
    if (details !== null) {
      return details
    }
  }
  return null
}

const getProfanityDetailsSingle = function getProfanityDetailsSingle(
  text: string
): ProfanityDetails {
  const details = isSafeText(text) || text.length <= 2 ? null : findLocalProfanity(text)
  return details ?? { isFlagged: false, source: 'none' }
}

export function getProfanityDetails(input: string): ProfanityDetails
export function getProfanityDetails(input: string[]): TextProfanityDetails[]
export function getProfanityDetails(
  input: string | string[]
): ProfanityDetails | TextProfanityDetails[]
export function getProfanityDetails(
  input: string | string[]
): ProfanityDetails | TextProfanityDetails[] {
  if (Array.isArray(input)) {
    return input.map((text) => ({
      text,
      ...getProfanityDetailsSingle(text),
    }))
  }

  return getProfanityDetailsSingle(input)
}

const isFlaggedByOpenAi = async function isFlaggedByOpenAi(
  text: string,
  apiKey: string
): Promise<boolean> {
  try {
    const response = await axios.post<ModerationResponse>(
      'https://api.openai.com/v1/moderations',
      {
        input: text,
        model: 'omni-moderation-latest',
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    )
    return response.data.results[0]?.flagged ?? false
  } catch (error) {
    console.error('Error using OpenAI moderation API:', error)
    return false
  }
}

const moderateTextSingle = async function moderateTextSingle(
  text?: string
): Promise<string | undefined> {
  if (text === undefined || text.trim().length === 0) {
    return text
  }

  if (isSafeText(text) || text.length <= 2) {
    return text
  }
  if (findLocalProfanity(text) !== null) {
    return '***'
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (apiKey === undefined || apiKey.length === 0) {
    return text
  }
  return (await isFlaggedByOpenAi(text, apiKey)) ? '***' : text
}

/**
 * Uses multiple profanity filters and OpenAI's moderation API to filter text
 * @param input Text to moderate
 * @returns Filtered text (original text if no issues, redacted if flagged)
 */
export async function moderateText(input: string | undefined): Promise<string | undefined>
/**
 * Uses multiple profanity filters and OpenAI's moderation API to filter text
 * @param input Array of texts to moderate
 * @returns Array of filtered texts (original text if no issues, redacted if flagged)
 */
export async function moderateText(input: string[] | undefined): Promise<string[] | undefined>
/**
 * Uses multiple profanity filters and OpenAI's moderation API to filter text
 * @param input Text or array of texts to moderate
 * @returns Filtered text (original text if no issues, redacted if flagged)
 */
export async function moderateText(
  input?: string | string[]
): Promise<string | (undefined | string)[] | undefined> {
  if (Array.isArray(input)) {
    return await Promise.all(input.map(async (text) => await moderateTextSingle(text)))
  }

  return await moderateTextSingle(input)
}
