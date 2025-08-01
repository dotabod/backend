/**
 * Profanity Filter API
 *
 * An all-in-one API for multilingual profanity detection and filtering.
 * Combines multiple libraries and custom detection algorithms for the best coverage.
 */

// Re-export core functionality
export { getProfanityDetails, moderateText } from './src/utils/moderation.js'
export {
  detectChineseProfanity,
  detectEuropeanProfanity,
  detectEvasionTactics,
  detectMultilingualProfanity,
  detectRussianProfanity,
} from './src/utils/profanity-wordlists.js'
export { createTextVariations, normalizeText, prepareText } from './src/utils/text-normalization.js'

// If this file is run directly, start the API server
if (import.meta.main) {
  import('./src/index.js')
}
