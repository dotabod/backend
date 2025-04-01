import axios from 'axios'
import { detect } from 'curse-filter'
import {
  RegExpMatcher,
  TextCensor,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity'
import { profanity } from '@2toad/profanity'
import { Filter } from 'bad-words'
import leoProfanity from 'leo-profanity'
import naughtyWords from 'naughty-words'
import profanityUtil from 'profanity-util'
import { flatWords as russianBadWordsList } from 'russian-bad-words'
import wash from 'washyourmouthoutwithsoap'
import {
  detectMultilingualProfanity,
  detectRussianProfanity,
  detectChineseProfanity,
  detectEvasionTactics,
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

// Initialize libraries
const badWords = new Filter()

// Initialize leo-profanity with all available dictionaries
leoProfanity.loadDictionary('en') // English
leoProfanity.loadDictionary('fr') // French
leoProfanity.loadDictionary('ru') // Russian
leoProfanity.add(leoProfanity.getDictionary('ru'))
leoProfanity.add(leoProfanity.getDictionary('fr'))

// Add Russian bad words from the russian-bad-words library to leo-profanity
leoProfanity.add(russianBadWordsList)

// Get supported locales from washyourmouthoutwithsoap
const supportedLocales = wash.supported()

// Initialize obscenity matcher
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
})

const censor = new TextCensor()

/**
 * Helper function to check text against Russian bad words list
 */
function checkRussianBadWords(text: string): boolean {
  const lowerText = text.toLowerCase()
  return russianBadWordsList.some((word) => lowerText.includes(word.toLowerCase()))
}

/**
 * Helper function to extract Russian bad words from text
 */
function extractRussianBadWords(text: string): string[] {
  const lowerText = text.toLowerCase()
  return russianBadWordsList.filter((word) => lowerText.includes(word.toLowerCase()))
}

/**
 * Helper function to check text against washyourmouthoutwithsoap for all locales
 */
function checkWashProfanity(text: string): {
  detected: boolean
  locale?: string
  matchingWords?: string[]
} {
  for (const locale of supportedLocales) {
    if (wash.check(locale, text)) {
      // Get the actual words for diagnostic purposes
      const wordList = wash.words(locale)

      // The actual words that matched using washyourmouthoutwithsoap's tokenize method
      const tokens = text
        .toLowerCase()
        .replace(/[\s+]+/g, ' ')
        .replace('/ {2,}/', ' ')
        .split(' ')
        .concat(
          text
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace('/ {2,}/', ' ')
            .split(' '),
        )

      const matchingWords = wordList.filter((word) => tokens.includes(word.toLowerCase()))

      return {
        detected: true,
        locale,
        matchingWords: matchingWords.length > 0 ? matchingWords : undefined,
      }
    }
  }

  return { detected: false }
}

/**
 * Uses multiple profanity filters and OpenAI's moderation API to filter text
 * @param input Text or array of texts to moderate
 * @returns Filtered text (original text if no issues, redacted if flagged)
 */
export async function moderateText(input: string | string[]): Promise<string | string[]> {
  // Handle array of strings
  if (Array.isArray(input)) {
    const results = await Promise.all(input.map((text) => moderateTextSingle(text)))
    return results
  }

  // Handle single string
  return moderateTextSingle(input)
}

/**
 * Helper function to moderate a single text string
 * @param text Text to moderate
 * @returns Filtered text
 */
async function moderateTextSingle(text: string): Promise<string> {
  // If text is empty, return as is
  if (!text.trim()) {
    return text
  }

  // Create text variations to enhance detection
  const textVariations = createTextVariations(text)

  // Layer 1: Multi-language check with washyourmouthoutwithsoap (50+ languages)
  try {
    const washResult = checkWashProfanity(text)
    if (washResult.detected) {
      return '***'
    }
  } catch (error) {
    console.error('Error using washyourmouthoutwithsoap library:', error)
  }

  // Layer 2: Russian-specific profanity check using russian-bad-words package
  try {
    if (checkRussianBadWords(text)) {
      return '***'
    }
  } catch (error) {
    console.error('Error using russian-bad-words library:', error)
  }

  // Layer 3: Check with bad-words library (English-focused)
  try {
    if (badWords.isProfane(text)) {
      return '***'
    }
  } catch (error) {
    console.error('Error using bad-words library:', error)
  }

  // Layer 4: Check with leo-profanity (supports EN, FR, RU)
  try {
    if (leoProfanity.check(text)) {
      return '***'
    }
  } catch (error) {
    console.error('Error using leo-profanity library:', error)
  }

  // Layer 5: Check with profanity-util (provides a score)
  try {
    const profanityScore = profanityUtil.check(text)
    if (profanityScore[1] > 0) {
      // If any profanity detected
      return '***'
    }
  } catch (error) {
    console.error('Error using profanity-util library:', error)
  }

  // Layer 6: Check with naughty-words (multilingual lists)
  try {
    for (const lang of Object.keys(naughtyWords)) {
      // Skip non-array properties
      if (!Array.isArray(naughtyWords[lang])) continue

      // For each language's word list
      const wordList = naughtyWords[lang] as string[]
      if (wordList.some((word) => text.toLowerCase().includes(word.toLowerCase()))) {
        return '***'
      }
    }
  } catch (error) {
    console.error('Error using naughty-words library:', error)
  }

  // Layer 7: Check each variation with curse-filter (supports multiple languages)
  for (const variation of textVariations) {
    if (detect(variation)) {
      return '***'
    }
  }

  // Layer 8: Check each variation with @2toad/profanity (supports multi-language)
  for (const variation of textVariations) {
    if (profanity.exists(variation)) {
      return '***'
    }
  }

  // Layer 9: Check with obscenity (better pattern matching for evasion tactics)
  for (const variation of textVariations) {
    const matches = matcher.getAllMatches(variation)
    if (matches.length > 0) {
      return '***'
    }
  }

  // Layer 10: Custom multilingual profanity detection
  if (detectMultilingualProfanity(text)) {
    return '***'
  }

  // Layer 11: If no OPENAI_API_KEY is set, return as is after all local checks
  if (!process.env.OPENAI_API_KEY) {
    return text
  }

  // Layer 12: OpenAI's moderation API as final check
  try {
    const response = await axios.post<ModerationResponse>(
      'https://api.openai.com/v1/moderations',
      {
        input: text,
        model: 'omni-moderation-latest',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      },
    )

    // If content is flagged, replace with asterisks
    if (response.data.results[0]?.flagged) {
      return '***'
    }

    // If not flagged, return original text
    return text
  } catch (error) {
    console.error('Error using OpenAI moderation API:', error)
    // Fallback to returning original text if API call fails
    return text
  }
}

/**
 * Get detailed information about profanity detection
 * @param input Text or array of texts to check
 * @returns Object with profanity details
 */
export function getProfanityDetails(input: string | string[]):
  | {
      isFlagged: boolean
      source: string
      matches?: string[]
      language?: string
    }
  | Array<{
      text: string
      isFlagged: boolean
      source: string
      matches?: string[]
      language?: string
    }> {
  // Handle array of strings
  if (Array.isArray(input)) {
    return input.map((text) => ({
      text,
      ...getProfanityDetailsSingle(text),
    }))
  }

  // Handle single string
  return getProfanityDetailsSingle(input)
}

/**
 * Helper function to get profanity details for a single text string
 */
function getProfanityDetailsSingle(text: string): {
  isFlagged: boolean
  source: string
  matches?: string[]
  language?: string
} {
  // Create text variations for enhanced detection
  const textVariations = createTextVariations(text)

  // Check with washyourmouthoutwithsoap (multi-language)
  try {
    const washResult = checkWashProfanity(text)
    if (washResult.detected) {
      return {
        isFlagged: true,
        source: 'washyourmouthoutwithsoap',
        language: washResult.locale,
        matches: washResult.matchingWords,
      }
    }
  } catch (error) {
    console.error('Error using washyourmouthoutwithsoap library in details:', error)
  }

  // Check with russian-bad-words
  try {
    if (checkRussianBadWords(text)) {
      const extracted = extractRussianBadWords(text)
      return {
        isFlagged: true,
        source: 'russian-bad-words',
        language: 'russian',
        matches: extracted.length > 0 ? extracted : undefined,
      }
    }
  } catch (error) {
    console.error('Error using russian-bad-words library in details:', error)
  }

  // Check with bad-words
  try {
    if (badWords.isProfane(text)) {
      return {
        isFlagged: true,
        source: 'bad-words',
        matches: text.split(' ').filter((word) => badWords.isProfane(word)),
      }
    }
  } catch (error) {
    console.error('Error using bad-words library in details:', error)
  }

  // Check with leo-profanity
  try {
    if (leoProfanity.check(text)) {
      const words = text.split(' ')
      const profaneWords = words.filter((word) => leoProfanity.check(word))
      return {
        isFlagged: true,
        source: 'leo-profanity',
        matches: profaneWords,
      }
    }
  } catch (error) {
    console.error('Error using leo-profanity library in details:', error)
  }

  // Check with profanity-util
  try {
    const profanityScore = profanityUtil.check(text)
    if (profanityScore[1] > 0) {
      return {
        isFlagged: true,
        source: 'profanity-util',
        matches: profanityScore[0],
      }
    }
  } catch (error) {
    console.error('Error using profanity-util library in details:', error)
  }

  // Check with naughty-words (multilingual lists)
  try {
    for (const lang of Object.keys(naughtyWords)) {
      // Skip non-array properties
      if (!Array.isArray(naughtyWords[lang])) continue

      // For each language's word list
      const wordList = naughtyWords[lang] as string[]
      const matchedWords = wordList.filter((word) =>
        text.toLowerCase().includes(word.toLowerCase()),
      )

      if (matchedWords.length > 0) {
        return {
          isFlagged: true,
          source: 'naughty-words',
          language: lang,
          matches: matchedWords,
        }
      }
    }
  } catch (error) {
    console.error('Error using naughty-words library in details:', error)
  }

  // Check with curse-filter
  for (const variation of textVariations) {
    if (detect(variation)) {
      return { isFlagged: true, source: 'curse-filter', matches: [variation] }
    }
  }

  // Check with @2toad/profanity
  for (const variation of textVariations) {
    if (profanity.exists(variation)) {
      const censored = profanity.censor(variation)
      return { isFlagged: true, source: '@2toad/profanity', matches: [variation] }
    }
  }

  // Check with obscenity
  for (const variation of textVariations) {
    const matches = matcher.getAllMatches(variation)
    if (matches.length > 0) {
      return {
        isFlagged: true,
        source: 'obscenity',
        matches: matches.map((match) => variation.substring(match.startIndex, match.endIndex)),
      }
    }
  }

  // Check with custom multilingual detection
  if (detectRussianProfanity(text)) {
    return { isFlagged: true, source: 'custom-wordlist', language: 'russian' }
  }

  if (detectChineseProfanity(text)) {
    return { isFlagged: true, source: 'custom-wordlist', language: 'chinese' }
  }

  if (detectEvasionTactics(text)) {
    return { isFlagged: true, source: 'evasion-tactics' }
  }

  return { isFlagged: false, source: 'none' }
}

// Example usage:
// const result = await moderateText('test text');
// const details = getProfanityDetails('test text');
// console.log(result, details);
