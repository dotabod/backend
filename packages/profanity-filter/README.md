# Multilingual Profanity Filtering System

This document describes the comprehensive profanity filtering system implemented in the Dota application. The system uses multiple external libraries and wordlists to provide robust, multilingual profanity detection with protection against common evasion tactics.

## Overview

The profanity filtering system employs multiple layers of detection to ensure comprehensive coverage:

1. Multiple external libraries with their own wordlists
2. Language-specific wordlists from multiple sources
3. Pattern matching for evasion tactics
4. Text normalization to catch variations
5. OpenAI moderation API as a final check

## Libraries Used

The solution combines several popular open-source profanity-filtering libraries instead of maintaining our own wordlists:

1. **bad-words**: Primary filter for English profanity with robust pattern matching.
2. **leo-profanity**: Multi-language support (English, French, Russian).
3. **naughty-words**: Extensive multi-language wordlists.
4. **profanity-util**: Provides scoring and additional detection capabilities.
5. **@2toad/profanity**: Additional filtering with customizable patterns.
6. **obscenity**: Powerful pattern matching with support for evasion tactics.
7. **curse-filter**: Catches common curse words and variations.
8. **russian-bad-words**: Specialized detection for Russian profanity.
9. **washyourmouthoutwithsoap**: Comprehensive support for 50+ languages with ISO 639-1 locales.

## Custom Detection

In addition to the external libraries, the system includes custom detection for:

1. Russian profanity (including character substitutions)
2. Chinese profanity
3. European languages (Spanish, French, German)
4. Common evasion tactics:
   - Stretched characters (e.g., "fuuuuck")
   - Leetspeak (e.g., "f4ck")
   - Separated characters (e.g., "f*u*c*k")
   - Unicode substitutions (e.g., "ƒʊ¢κ")

## Text Normalization

The system applies various text normalization techniques:

1. International character normalization
2. Leetspeak decoding
3. Repeated character normalization
4. Separator removal
5. Character substitution handling

## API Fallback

When an OpenAI API key is available, the system uses the OpenAI moderation API as a final check. This helps catch any profanity that might have been missed by the other layers.

## Usage

The main functions provided by the system are:

### `moderateText(text: string): Promise<string>`

Checks the input text for profanity across all layers and returns:
- The original text if no profanity is detected
- "***" if profanity is detected

```typescript
import { moderateText } from './utils/moderation.js';

// Example usage
const result = await moderateText("Hello world");
console.log(result); // "Hello world" (if clean)

const profaneResult = await moderateText("f*ck this");
console.log(profaneResult); // "***" (if profane)
```

### `getProfanityDetails(text: string): { isFlagged: boolean, source: string, matches?: string[], language?: string }`

Returns detailed information about why text was flagged, including:
- Which detection system flagged it
- The matched profane words
- The language detected (when available)

```typescript
import { getProfanityDetails } from './utils/moderation.js';

// Example usage
const details = getProfanityDetails("F*ck this");
console.log(details);
// Output: { isFlagged: true, source: 'obscenity', matches: ['F*ck'] }
```

## Performance Considerations

The system is designed to be thorough rather than highly optimized for speed. It prioritizes accuracy and multilingual support over performance. For high-volume applications, consider:

1. Caching results for common inputs
2. Implementing early exit strategies for obvious cases
3. Selectively enabling/disabling certain layers based on needs

## Extending the System

To add support for additional languages or specific terms:

1. Add new words to the existing libraries that support custom wordlists:
   ```typescript
   badWords.addWords('custom', 'words', 'here');
   leoProfanity.add(['custom', 'words', 'here']);
   ```

2. Extend the custom wordlists in `profanity-wordlists.ts`

3. Add new language-specific detection functions as needed

## Testing

The system includes comprehensive testing to ensure all detection layers work correctly:

- Normal text validation
- Obfuscated profanity detection (spacing, symbols, leetspeak)
- Multi-language profanity detection (English, Russian, Chinese, Spanish, German, etc.)
- Detection of various evasion tactics (Unicode substitution, character stretching)
- Embedded profanity detection

Test results demonstrate high accuracy across languages and obfuscation techniques with the following layers performing exceptionally well:
- washyourmouthoutwithsoap (50+ languages)
- russian-bad-words (specialized Russian detection)
- obscenity (evasion tactics)
- naughty-words (multi-language support)
