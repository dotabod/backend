/**
 * profanity-wordlists.ts
 *
 * This file contains additional language-specific profanity lists and utility
 * functions to enhance multilingual profanity detection.
 */

import {
  createTextVariations,
  normalizeText,
  prepareText,
  removeSeparators,
} from './text-normalization'

// Russian profanity terms (common ones)
export const russianProfanityList = [
  'сука',
  'блять',
  'пидор',
  'пидар',
  'хуй',
  'ебать',
  'нахуй',
  'пизда',
  'залупа',
  'бля',
  'ебал',
  'ебаный',
  'ебанько',
  'ебанный',
  'ебанат',
  'пидр',
  'пизд',
  'хуе',
  'хуи',
  'хуя',
  'хер',
  'херня',
  'херь',
  'мудак',
  'мудила',
  'блядь',
]

// Chinese profanity terms
export const chineseProfanityList = [
  '操你妈',
  '肏你妈',
  '草你妈',
  '妈的',
  '他妈的',
  '傻逼',
  '滚蛋',
  '废物',
  '婊子',
  '贱人',
  '靠',
  '操',
  '屁眼',
  '混蛋',
  '王八蛋',
  '去死',
  '白痴',
  '吃屎',
  '你妈逼',
  '日你妈',
]

// Additional European languages profanity
export const europeanProfanityList = {
  // Spanish
  spanish: [
    'puta',
    'mierda',
    'cojones',
    'joder',
    'follar',
    'cabron',
    'cabrón',
    'coño',
    'gilipollas',
    'hijo de puta',
    'hijoputa',
    'imbécil',
    'capullo',
    'idiota',
  ],
  // French
  french: [
    'putain',
    'merde',
    'connard',
    'baise',
    'foutre',
    'con',
    'salope',
    'pute',
    'enculé',
    'fils de pute',
    'bordel',
    'cul',
    'branler',
    'crétin',
    'connasse',
  ],
  // German
  german: [
    'scheiße',
    'arschloch',
    'fotze',
    'fick',
    'wichser',
    'hurensohn',
    'mistkerl',
    'schwuchtel',
    'schwanz',
    'verfickt',
    'verdammt',
    'schlampe',
    'hure',
  ],
}

// Spanish profanity in leetspeak form (pre-generated common variants)
const spanishLeetSpeakList = [
  'h1j0 d3 put4',
  'h1j0d3put4',
  'h1jod3put4',
  'hij0 d3 put4',
  'p0r0n',
  'p0rn0',
  'p0rnogr4f14',
  'p0rn0gr4f14',
  'p0rn0gr4fi4',
  'c0j0n3s',
  'c0jon3s',
  'j0d3r',
  'c4br0n',
  'c4bron',
  'c0ñ0',
  'c0n0',
  'pu74',
  'put4',
  'mierd4',
  'm13rd4',
  'h1j0pu74',
  'pv74',
  'pvt4',
  'c4pull0',
  'c4pull0',
  '1mb3c1l',
  '1d10t4',
]

// Common character substitutions for leetspeak in European languages
const europeanLeetSpeakMap: Record<string, string[]> = {
  a: ['a', '@', '4'],
  b: ['b', '8', '6'],
  e: ['e', '3'],
  i: ['i', '1', '!'],
  l: ['l', '1'],
  o: ['o', '0'],
  s: ['s', '5', '$'],
  t: ['t', '7'],
  u: ['u', 'v'],
}

// Regex patterns for detecting common evasion tactics
export const evasionPatterns = [
  // Repeated characters (e.g., 'fuuuuck')
  /([a-zA-Z])\1{2,}/g,

  // Leetspeak patterns
  /[f]+[\s_]*[u]+[\s_]*[c]+[\s_]*[k]+/i, // F*u*c*k variations
  /[s]+[\s_]*[h]+[\s_]*[i]+[\s_]*[t]+/i, // S*h*i*t variations
  /[a]+[\s_]*[s]+[\s_]*[s]+/i, // A*s*s variations

  // Character substitutions
  /[f][\W_]*[u@4][\W_]*[c][\W_]*[k]/i, // f*u*c*k with symbols
  /[s][\W_]*[h][\W_]*[i1!][\W_]*[t]/i, // s*h*i*t with symbols
  /[b][\W_]*[i1!][\W_]*[t][\W_]*[c][\W_]*[h]/i, // b*i*t*c*h with symbols
]

/**
 * Helper function to clean and normalize text specifically for Russian
 */
function normalizeRussianText(text: string): string {
  // Remove separators (spaces, *, -, ., etc.) for Russian text
  const noSeparators = text.replace(/[\s\.\*_\-]/g, '')

  // Special handling for Russian character substitutions
  return noSeparators
    .replace(/0/g, 'о') // Replace 0 with о
    .replace(/3/g, 'з') // Replace 3 with з
    .replace(/4/g, 'ч') // Replace 4 with ч
    .replace(/6/g, 'б') // Replace 6 with б
    .replace(/y/g, 'у') // Replace y with у
    .toLowerCase()
}

/**
 * Creates variations of Russian text with Latin-Cyrillic character replacements
 * This helps catch obfuscation where Cyrillic characters are replaced with visually similar Latin ones
 */
function createRussianLatinVariations(text: string): string[] {
  const variations = [text]

  // Common Latin-to-Cyrillic character mappings (and vice versa)
  const latinToCyrillic: Record<string, string> = {
    a: 'а', // Latin a to Cyrillic а
    e: 'е', // Latin e to Cyrillic е
    o: 'о', // Latin o to Cyrillic о
    p: 'р', // Latin p to Cyrillic р
    x: 'х', // Latin x to Cyrillic х
    c: 'с', // Latin c to Cyrillic с
    y: 'у', // Latin y to Cyrillic у
    h: 'н', // Latin h to Cyrillic н
    k: 'к', // Latin k to Cyrillic к
    b: 'в', // Latin b to Cyrillic в
    m: 'м', // Latin m to Cyrillic м
    t: 'т', // Latin t to Cyrillic т
  }

  // Create a version where Latin characters are replaced with Cyrillic
  let cyrillicVersion = text.toLowerCase()
  for (const [latin, cyrillic] of Object.entries(latinToCyrillic)) {
    cyrillicVersion = cyrillicVersion.replace(new RegExp(latin, 'g'), cyrillic)
  }
  variations.push(cyrillicVersion)

  // Create a version where Cyrillic characters are replaced with Latin
  let latinVersion = text.toLowerCase()
  for (const [latin, cyrillic] of Object.entries(latinToCyrillic)) {
    latinVersion = latinVersion.replace(new RegExp(cyrillic, 'g'), latin)
  }
  variations.push(latinVersion)

  return variations
}

/**
 * Detects profanity in Russian text
 */
export function detectRussianProfanity(text: string): boolean {
  const variations = createTextVariations(text)

  // Add special Russian normalized version
  variations.push(normalizeRussianText(text))

  // Add version with separators removed (for cases like "п*и*д*о*р")
  const noSeparators = removeSeparators(text)
  variations.push(noSeparators)

  // Add variations with Latin-Cyrillic character replacements
  variations.push(...createRussianLatinVariations(text))

  // Check each variation against the Russian profanity list
  for (const variation of variations) {
    const lowerVariation = variation.toLowerCase()

    for (const word of russianProfanityList) {
      if (lowerVariation.includes(word)) {
        return true
      }

      // Check for letter substitutions (common in Russian)
      const substitutedWord = word
        .replace(/о/g, '0')
        .replace(/и/g, 'u')
        .replace(/е/g, 'e')
        .replace(/а/g, '@')

      if (lowerVariation.includes(substitutedWord)) {
        return true
      }
    }
  }

  return false
}

/**
 * Detects profanity in Chinese text
 */
export function detectChineseProfanity(text: string): boolean {
  for (const word of chineseProfanityList) {
    if (text.includes(word)) {
      return true
    }
  }
  return false
}

/**
 * Detects profanity using common evasion tactics
 */
export function detectEvasionTactics(text: string): boolean {
  // Check original text
  if (evasionPatterns.some((pattern) => pattern.test(text))) {
    return true
  }

  // Check normalized text
  const normalized = normalizeText(text)
  if (evasionPatterns.some((pattern) => pattern.test(normalized))) {
    return true
  }

  // Check fully prepared text
  const prepared = prepareText(text)
  return evasionPatterns.some((pattern) => pattern.test(prepared))
}

/**
 * Generate leetspeak variations of a word
 */
function generateLeetSpeakVariations(word: string): string[] {
  const variations: string[] = [word]

  // Simple replacement for short words
  let leetVersion = word.toLowerCase()

  // Apply common leetspeak substitutions
  for (const [char, replacements] of Object.entries(europeanLeetSpeakMap)) {
    for (const replacement of replacements) {
      if (replacement !== char) {
        // Skip the original character
        leetVersion = leetVersion.replace(new RegExp(char, 'g'), replacement)
      }
    }
  }

  if (leetVersion !== word.toLowerCase()) {
    variations.push(leetVersion)
  }

  return variations
}

/**
 * Applies aggressive leetspeak transformations to text
 */
function applyAggressiveLeetSpeak(text: string): string {
  let leetText = text.toLowerCase()

  // Apply all possible substitutions
  leetText = leetText
    .replace(/a/g, '4')
    .replace(/b/g, '8')
    .replace(/e/g, '3')
    .replace(/i/g, '1')
    .replace(/l/g, '1')
    .replace(/o/g, '0')
    .replace(/s/g, '5')
    .replace(/t/g, '7')
    .replace(/z/g, '2')

  return leetText
}

/**
 * Detects profanity in European languages
 */
export function detectEuropeanProfanity(text: string): boolean {
  const variations = createTextVariations(text)

  // Add version with separators removed
  variations.push(removeSeparators(text))

  // Add aggressively leetspeak-transformed version
  variations.push(applyAggressiveLeetSpeak(text))

  // Direct check against pre-generated Spanish leetspeak terms
  const lowerText = text.toLowerCase()
  for (const term of spanishLeetSpeakList) {
    if (lowerText.includes(term)) {
      return true
    }
  }

  // Function to check text against a word list with leetspeak variations
  const checkAgainstWordlist = (wordList: string[]): boolean => {
    for (const word of wordList) {
      // Generate leetspeak variations for each word
      const wordVariations = generateLeetSpeakVariations(word)

      for (const variation of variations) {
        const lowerVariation = variation.toLowerCase()

        // Check original word and its leetspeak variations
        for (const wordVar of wordVariations) {
          if (lowerVariation.includes(wordVar)) {
            return true
          }
        }
      }
    }
    return false
  }

  // Check Spanish profanity
  if (checkAgainstWordlist(europeanProfanityList.spanish)) {
    return true
  }

  // Check French profanity
  if (checkAgainstWordlist(europeanProfanityList.french)) {
    return true
  }

  // Check German profanity
  if (checkAgainstWordlist(europeanProfanityList.german)) {
    return true
  }

  return false
}

/**
 * Combined function to check for profanity across multiple languages and techniques
 */
export function detectMultilingualProfanity(text: string): boolean {
  return (
    detectRussianProfanity(text) ||
    detectChineseProfanity(text) ||
    detectEuropeanProfanity(text) ||
    detectEvasionTactics(text)
  )
}
