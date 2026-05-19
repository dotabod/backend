/**
 * text-normalization.ts
 *
 * Utilities for text normalization and preprocessing to enhance profanity detection
 * by handling common obfuscation techniques.
 */

/**
 * Compresses repeated characters to single characters
 * e.g., "fuuuuck" becomes "fuck"
 */
export function compressRepeatedCharacters(text: string): string {
  return text.replace(/(.)\1+/g, '$1')
}

/**
 * Character mappings for common substitutions used to obfuscate profanity
 */
const CHAR_SUBSTITUTIONS: Record<string, string[]> = {
  a: ['a', 'à', 'á', 'â', 'ã', 'ä', 'å', 'ā', 'ă', 'ą', 'ª', 'α', 'а', '@', '4', '*'],
  b: ['b', 'ß', 'β', 'б', '8', '6', 'ь'],
  c: ['c', 'ç', 'ć', 'č', 'ĉ', 'ċ', '¢', 'с', 'ƈ', '<', '(', '{'],
  d: ['d', 'ď', 'đ', 'д', 'ð', 'δ'],
  e: ['e', 'è', 'é', 'ê', 'ë', 'ē', 'ĕ', 'ė', 'ę', 'ě', 'ε', 'е', 'ё', '€', '3'],
  f: ['f', 'ƒ', 'φ', 'ф'],
  g: ['g', 'ğ', 'ĝ', 'ġ', 'ģ', 'г', 'γ', '9', 'q'],
  h: ['h', 'ĥ', 'ħ', 'η', 'х', 'н', 'ɧ'],
  i: ['i', 'ì', 'í', 'î', 'ï', 'ĩ', 'ī', 'ĭ', 'į', 'ı', 'і', 'и', 'й', 'ɪ', '!', '1', '|'],
  j: ['j', 'ĵ', 'ј'],
  k: ['k', 'ķ', 'к', 'κ'],
  l: ['l', 'ĺ', 'ļ', 'ľ', 'ł', 'л', 'λ'],
  m: ['m', 'м', 'μ'],
  n: ['n', 'ñ', 'ń', 'ņ', 'ň', 'ŉ', 'н'],
  o: ['o', 'ò', 'ó', 'ô', 'õ', 'ö', 'ø', 'ō', 'ŏ', 'ő', 'œ', 'о', 'ο', '0', '*'],
  p: ['p', 'ρ', 'р', 'þ'],
  q: ['q', 'я'],
  r: ['r', 'ŕ', 'ř', 'ŗ', 'р', 'ρ'],
  s: ['s', 'ś', 'š', 'ş', 'с', 'ѕ', 'ʂ', '5', '$'],
  t: ['t', 'ť', 'ţ', 'т', 'τ', 'ɬ', '7', '+'],
  u: ['u', 'ù', 'ú', 'û', 'ü', 'ũ', 'ū', 'ŭ', 'ů', 'ű', 'ų', 'у', 'μ', 'v'],
  v: ['v', 'ν', 'в', 'u'],
  w: ['w', 'ŵ', 'ω', 'щ', 'ш', 'ψ', 'vv'],
  x: ['x', '×', 'х', 'ж', '%'],
  y: ['y', 'ý', 'ÿ', 'ŷ', 'й', 'υ', 'ύ', 'ϋ', 'у'],
  z: ['z', 'ź', 'ż', 'ž', 'з', 'ζ', '2'],
}

// Removed problematic bidirectional mappings to prevent false positives
// 'i' and 'l' conflation was causing legitimate words to be flagged
// When normalizing text for profanity detection, we want to catch obfuscation
// without causing excessive false positives

/**
 * Normalizes text by replacing common character substitutions
 * to their standard form, but only for known profanity patterns
 *
 * @param text Input text to normalize
 * @returns Normalized text
 */
export function normalizeText(text: string): string {
  let normalized = text.toLowerCase()

  // Only apply aggressive normalization to suspicious patterns
  // Check for potential obfuscation markers first
  const hasPotentialObfuscation =
    /[^\w\s]|[0-9]|(.)\1{2,}/g.test(normalized) || /\w\s\w\s\w/.test(normalized) // Spaced out letters

  if (!hasPotentialObfuscation) {
    return normalized // Skip normalization for normal-looking text
  }

  // Replace each character with its standard form
  for (const [char, substitutions] of Object.entries(CHAR_SUBSTITUTIONS)) {
    for (const substitute of substitutions) {
      // Skip the standard form itself
      if (substitute === char) continue

      // Special characters need to be escaped in regular expressions
      const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const safeSubstitute = escapeRegExp(substitute)

      // Replace all occurrences of the substitute with the standard char
      normalized = normalized.replace(new RegExp(safeSubstitute, 'g'), char)
    }
  }

  return normalized
}

/**
 * Removes repeated characters to handle stretching
 * e.g., "fuuuuuck" becomes "fuck"
 *
 * @param text Input text to normalize
 * @returns Text with repeated characters normalized
 */
export function normalizeRepeatedChars(text: string): string {
  // Replace 3 or more repetitions with just 1
  return text.replace(/(.)\1{2,}/g, '$1')
}

/**
 * Removes common separators used to obfuscate words
 * e.g., "f*u*c*k" becomes "fuck"
 *
 * @param text Input text to normalize
 * @returns Text with separators removed
 */
export function removeSeparators(text: string): string {
  // Common separators: spaces, dots, asterisks, underscores, hyphens
  return text.replace(/[\s.*_-]/g, '')
}

/**
 * Removes non-alphanumeric characters to get the core text
 *
 * @param text Input text
 * @returns Text with only alphanumeric characters
 */
export function stripNonAlphanumeric(text: string): string {
  return text.replace(/[^a-zA-Z0-9\s]/g, '')
}

/**
 * Fully prepares text for profanity detection by applying all normalizations
 *
 * @param text Input text to process
 * @returns Processed text ready for profanity checking
 */
export function prepareText(text: string): string {
  // First, normalize international characters and leetspeak substitutions
  let prepared = normalizeText(text)

  // Check for potential obfuscation markers first
  const hasPotentialObfuscation = /[^\w\s]|[0-9]|(.)\1{2,}/g.test(text) || /\w\s\w\s\w/.test(text) // Spaced out letters

  if (!hasPotentialObfuscation) {
    return prepared // Skip further processing for normal-looking text
  }

  // Remove separators to handle obfuscation like "f*u*c*k" or "f.u.c.k"
  prepared = removeSeparators(prepared)

  // Normalize repeated characters to handle "fuuuuuck" -> "fuck"
  prepared = normalizeRepeatedChars(prepared)

  return prepared
}

/**
 * Creates variations of the input text to check against profanity lists
 *
 * @param text Input text
 * @returns Array of text variations to check
 */
export function createTextVariations(text: string): string[] {
  // Check for potential obfuscation markers first
  const hasPotentialObfuscation = /[^\w\s]|[0-9]|(.)\1{2,}/g.test(text) || /\w\s\w\s\w/.test(text) // Spaced out letters

  // Create compressed version of text (e.g., "fuuuuck" becomes "fuck")
  const compressedText = compressRepeatedCharacters(text)

  // Only proceed with both checks if the compressed text is different
  const needsCompressedCheck = compressedText !== text

  if (!hasPotentialObfuscation && !needsCompressedCheck) {
    // For normal-looking text, just return minimal variations
    return [text, text.toLowerCase()]
  }

  // For suspect text, apply all transformations
  const variations: string[] = [
    text, // Original text
    text.toLowerCase(), // Lowercase
    normalizeText(text), // Normalized character substitutions
    prepareText(text), // Fully processed text
    stripNonAlphanumeric(text), // Alphanumeric-only version
  ]

  if (needsCompressedCheck) {
    variations.push(compressedText)
  }

  return [...new Set(variations)] // Remove duplicates
}
