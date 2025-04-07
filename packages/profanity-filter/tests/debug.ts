/**
 * debug.ts
 *
 * Debug script to figure out why "Will we win with Riki?" is being flagged as profanity
 */

import {
  detectMultilingualProfanity,
  detectEvasionTactics,
  evasionPatterns,
} from '../src/utils/profanity-wordlists.js'
import {
  createTextVariations,
  normalizeText,
  prepareText,
  removeSeparators,
} from '../src/utils/text-normalization.js'

// Test text that's getting false positive
const testText = 'Will we win with Riki?'

console.log('======== PROFANITY DETECTION DEBUG ========')
console.log(`Testing text: "${testText}"`)

// Check if it's detected by multilingual
const isMultilingual = detectMultilingualProfanity(testText)
console.log(`Detected by multilingual function: ${isMultilingual}`)

// Check if it's detected by evasion tactics
const isEvasion = detectEvasionTactics(testText)
console.log(`Detected by evasion tactics: ${isEvasion}`)

// Debug evasion patterns
console.log('\nTesting each evasion pattern:')
evasionPatterns.forEach((pattern, index) => {
  const match = pattern.test(testText)
  console.log(`Pattern ${index} (${pattern}): ${match}`)

  // If matched, show the match
  if (match) {
    // Reset the lastIndex to ensure we get all matches
    pattern.lastIndex = 0
    const matches = testText.match(pattern)
    console.log(`  - Matched: ${matches?.join(', ')}`)
  }
})

// Debug text variations
console.log('\nText variations generated:')
const variations = createTextVariations(testText)
variations.forEach((variation, index) => {
  console.log(`Variation ${index}: "${variation}"`)

  // Test each variation against each pattern
  evasionPatterns.forEach((pattern, patternIndex) => {
    // Reset lastIndex since we're reusing the regex
    pattern.lastIndex = 0
    const match = pattern.test(variation)
    if (match) {
      console.log(`  - Matches pattern ${patternIndex} (${pattern})`)

      // Reset again to get matches
      pattern.lastIndex = 0
      const matches = variation.match(pattern)
      console.log(`    Matched: ${matches?.join(', ')}`)
    }
  })
})

// Check special processing steps
console.log('\nSpecial processing:')
console.log(`Normalized: "${normalizeText(testText)}"`)
console.log(`Prepared: "${prepareText(testText)}"`)
console.log(`No separators: "${removeSeparators(testText)}"`)

// Test variations of the input text with slight changes to identify trigger words
const variationsToTest = [
  'Will we win with Riki',
  'Will we win with',
  'we win with Riki',
  'Will win with Riki',
  'Will we with Riki',
  'win with Riki',
  'win with',
  'we win',
]

console.log('\nTesting text variations to isolate trigger:')
variationsToTest.forEach((text) => {
  const isMultilingual = detectMultilingualProfanity(text)
  const isEvasion = detectEvasionTactics(text)
  console.log(`"${text}": multilingual=${isMultilingual}, evasion=${isEvasion}`)

  if (isEvasion) {
    evasionPatterns.forEach((pattern, index) => {
      // Reset lastIndex to ensure we get correct results
      pattern.lastIndex = 0
      const match = pattern.test(text)
      if (match) {
        console.log(`  - Matches pattern ${index} (${pattern})`)
      }
    })
  }
})
