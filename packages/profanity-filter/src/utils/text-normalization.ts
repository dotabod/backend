const compressRepeatedCharacters = function compressRepeatedCharacters(text: string): string {
  return text.replaceAll(/(.)\1+/gu, '$1')
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

export const normalizeText = function normalizeText(text: string): string {
  let normalized = text.toLowerCase()

  // Only apply aggressive normalization to suspicious patterns
  // Check for potential obfuscation markers first
  const hasPotentialObfuscation =
    // Spaced out letters
    /[^\w\s]|[0-9]|(.)\1{2,}/gu.test(normalized) || /\w\s\w\s\w/u.test(normalized)

  if (!hasPotentialObfuscation) {
    // Skip normalization for normal-looking text
    return normalized
  }

  // Replace each character with its standard form
  for (const [char, substitutions] of Object.entries(CHAR_SUBSTITUTIONS)) {
    for (const substitute of substitutions) {
      // Skip the standard form itself
      if (substitute === char) {
        continue
      }

      // Special characters need to be escaped in regular expressions
      const escapeRegExp = (str: string) => str.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')
      const safeSubstitute = escapeRegExp(substitute)

      // Replace all occurrences of the substitute with the standard char
      normalized = normalized.replaceAll(new RegExp(safeSubstitute, 'ug'), char)
    }
  }

  return normalized
}

export const normalizeRepeatedChars = function normalizeRepeatedChars(text: string): string {
  // Replace 3 or more repetitions with just 1
  return text.replaceAll(/(.)\1{2,}/gu, '$1')
}

export const removeSeparators = function removeSeparators(text: string): string {
  // Common separators: spaces, dots, asterisks, underscores, hyphens
  return text.replaceAll(/[\s.*_-]/gu, '')
}

export const stripNonAlphanumeric = function stripNonAlphanumeric(text: string): string {
  return text.replaceAll(/[^a-zA-Z0-9\s]/gu, '')
}

export const prepareText = function prepareText(text: string): string {
  // First, normalize international characters and leetspeak substitutions
  let prepared = normalizeText(text)

  // Check for potential obfuscation markers first
  // Spaced out letters
  const hasPotentialObfuscation = /[^\w\s]|[0-9]|(.)\1{2,}/gu.test(text) || /\w\s\w\s\w/u.test(text)

  if (!hasPotentialObfuscation) {
    // Skip further processing for normal-looking text
    return prepared
  }

  // Remove separators to handle obfuscation like "f*u*c*k" or "f.u.c.k"
  prepared = removeSeparators(prepared)

  // Normalize repeated characters to handle "fuuuuuck" -> "fuck"
  prepared = normalizeRepeatedChars(prepared)

  return prepared
}

export const createTextVariations = function createTextVariations(text: string): string[] {
  // Check for potential obfuscation markers first
  // Spaced out letters
  const hasPotentialObfuscation = /[^\w\s]|[0-9]|(.)\1{2,}/gu.test(text) || /\w\s\w\s\w/u.test(text)

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
    // Original text
    text,
    // Lowercase
    text.toLowerCase(),
    // Normalized character substitutions
    normalizeText(text),
    // Fully processed text
    prepareText(text),
    // Alphanumeric-only version
    stripNonAlphanumeric(text),
  ]

  if (needsCompressedCheck) {
    variations.push(compressedText)
  }

  // Remove duplicates
  return [...new Set(variations)]
}
