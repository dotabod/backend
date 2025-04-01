/**
 * Profanity Filter API
 *
 * An all-in-one API for multilingual profanity detection and filtering.
 * Combines multiple libraries and custom detection algorithms for the best coverage.
 */

// Re-export core functionality
export { moderateText, getProfanityDetails } from './src/utils/moderation'
export { createTextVariations, normalizeText, prepareText } from './src/utils/text-normalization'
export {
  detectMultilingualProfanity,
  detectRussianProfanity,
  detectChineseProfanity,
  detectEuropeanProfanity,
  detectEvasionTactics,
} from './src/utils/profanity-wordlists'

// If this file is run directly, start the API server
if (import.meta.main) {
  import('./src/index')
}
