/**
 * Profanity Filter API
 *
 * An all-in-one API for multilingual profanity detection and filtering.
 * Combines multiple libraries and custom detection algorithms for the best coverage.
 */

// Re-export core functionality
export { getProfanityDetails, moderateText } from './src/utils/moderation'
export {
  detectChineseProfanity,
  detectEuropeanProfanity,
  detectEvasionTactics,
  detectMultilingualProfanity,
  detectRussianProfanity,
} from './src/utils/profanity-wordlists'
export { createTextVariations, normalizeText, prepareText } from './src/utils/text-normalization'

// If this file is run directly, start the API server
if (import.meta.main) {
  import('./src/index')
}
