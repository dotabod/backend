/**
 * moderation.test.ts
 *
 * A simple test script to demonstrate the enhanced profanity detection system.
 * Run with: bun packages/profanity-filter/tests/moderation.test.ts
 */

import { moderateText, getProfanityDetails } from '../src/utils/moderation'
import { detect } from 'curse-filter'
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity'
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
} from '../src/utils/profanity-wordlists'
import { createTextVariations } from '../src/utils/text-normalization'

// Initialize necessary libraries
const badWords = new Filter()
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
})

// Initialize leo-profanity
leoProfanity.loadDictionary('en')
leoProfanity.loadDictionary('fr')
leoProfanity.loadDictionary('ru')
leoProfanity.add(leoProfanity.getDictionary('ru'))
leoProfanity.add(leoProfanity.getDictionary('fr'))
leoProfanity.add(russianBadWordsList)

// Helper function to check Russian bad words
function checkRussianBadWords(text: string): boolean {
  const lowerText = text.toLowerCase()
  return russianBadWordsList.some((word) => lowerText.includes(word.toLowerCase()))
}

// Helper function to check wash profanity
function checkWashProfanity(text: string): { detected: boolean; locale?: string } {
  const supportedLocales = wash.supported()
  for (const locale of supportedLocales) {
    if (wash.check(locale, text)) {
      return { detected: true, locale }
    }
  }
  return { detected: false }
}

async function runTest() {
  console.log('Testing enhanced profanity detection system:\n')

  const testCases = [
    { text: 'Hello world, this is a normal text.', description: 'Normal text' },
    { text: 'f u c k', description: 'Spaced profanity' },
    { text: 'f*u*c*k', description: 'Starred profanity' },
    { text: 'Fuuuuuuck', description: 'Stretched characters' },
    { text: 'F.u.c.k', description: 'Punctuated profanity' },
    { text: "That's a5s", description: 'Leet speak' },
    { text: 'сука блять', description: 'Russian profanity' },
    { text: 'пидор', description: 'Russian profanity 2' },
    { text: 'п и д о р', description: 'Spaced Russian profanity' },
    { text: 'п*и*д*о*р', description: 'Obfuscated Russian profanity' },
    { text: '操你妈', description: 'Chinese profanity' },
    { text: 'hijo de puta', description: 'Spanish profanity' },
    { text: 'h1j0 d3 put4', description: 'Leetspeak Spanish profanity' },
    { text: 'scheiße', description: 'German profanity' },
    { text: 'ƒʊ¢κ', description: 'Unicode substitution' },
    { text: 'ʃṳ𝒸𝗄', description: 'More complex unicode' },
    { text: 'wordsbeforefuckandafter', description: 'Embedded profanity' },
    { text: 'пидop', description: 'Russian profanity' },
    { text: 'й-пидор-чмо', description: 'Russian profanity' },
    { text: 'чурка', description: 'Russian ethnic slur 1' },
    { text: 'хач, кацап, чурка', description: 'Multiple Russian ethnic slurs' },
    { text: 'жид', description: 'Russian ethnic slur 2' },
    { text: 'хахол', description: 'Russian ethnic slur 3' },
    { text: 'москаль и хохол', description: 'Expanded slurs - Ukrainian/Russian' },
    { text: 'черномазый человек', description: 'Expanded slurs - Racial' },
    { text: 'китаеза и япошка', description: 'Expanded slurs - Asian' },
    { text: 'Он настоящий пшек', description: 'Expanded slurs - Polish' },
    { text: 'узкоглазый монгол', description: 'Expanded slurs - Asian features' },
    { text: 'цыганва на улице', description: 'Expanded slurs - Roma' },
    { text: 'Он жидяра', description: 'Expanded slurs - Antisemitic' },
    { text: 'Это chink из китая', description: 'Mixed language slur' },
    { text: 'Типичный n1gg3r', description: 'Obfuscated transliterated slur' },
  ]

  for (const testCase of testCases) {
    console.log(`Testing: "${testCase.text}" (${testCase.description})`)

    const moderated = await moderateText(testCase.text)
    const details = getProfanityDetails(testCase.text)

    console.log(`Moderated: "${moderated}"`)
    console.log(`Detection source: ${details.source}`)
    if (details.language) {
      console.log(`Language detected: ${details.language}`)
    }
    if (details.matches) {
      console.log(`Matched words: ${details.matches.join(', ')}`)
    }
    console.log('-------------------\n')
  }
}

// Library comparison test
async function compareLibraries() {
  console.log('\n=== LIBRARY PERFORMANCE COMPARISON ===\n')

  const testCases = [
    { text: 'Hello world, this is a normal text.', description: 'Normal text' },
    { text: 'f u c k', description: 'Spaced profanity' },
    { text: 'f*u*c*k', description: 'Starred profanity' },
    { text: 'Fuuuuuuck', description: 'Stretched characters' },
    { text: 'F.u.c.k', description: 'Punctuated profanity' },
    { text: "That's a5s", description: 'Leet speak' },
    { text: 'сука блять', description: 'Russian profanity' },
    { text: 'пидор', description: 'Russian profanity 2' },
    { text: 'п и д о р', description: 'Spaced Russian profanity' },
    { text: 'п*и*д*о*р', description: 'Obfuscated Russian profanity' },
    { text: '操你妈', description: 'Chinese profanity' },
    { text: 'hijo de puta', description: 'Spanish profanity' },
    { text: 'h1j0 d3 put4', description: 'Leetspeak Spanish profanity' },
    { text: 'scheiße', description: 'German profanity' },
    { text: 'ƒʊ¢κ', description: 'Unicode substitution' },
    { text: 'ʃṳ𝒸𝗄', description: 'More complex unicode' },
    { text: 'wordsbeforefuckandafter', description: 'Embedded profanity' },
    { text: 'пидop', description: 'Russian profanity' },
    { text: 'й-пидор-чмо', description: 'Russian profanity' },
    { text: 'чурка', description: 'Russian ethnic slur 1' },
    { text: 'хач, кацап, чурка', description: 'Multiple Russian ethnic slurs' },
    { text: 'жид', description: 'Russian ethnic slur 2' },
    { text: 'хахол', description: 'Russian ethnic slur 3' },
    { text: 'москаль и хохол', description: 'Expanded slurs - Ukrainian/Russian' },
    { text: 'черномазый человек', description: 'Expanded slurs - Racial' },
    { text: 'китаеза и япошка', description: 'Expanded slurs - Asian' },
    { text: 'Он настоящий пшек', description: 'Expanded slurs - Polish' },
    { text: 'узкоглазый монгол', description: 'Expanded slurs - Asian features' },
    { text: 'цыганва на улице', description: 'Expanded slurs - Roma' },
    { text: 'Он жидяра', description: 'Expanded slurs - Antisemitic' },
    { text: 'Это chink из китая', description: 'Mixed language slur' },
    { text: 'Типичный n1gg3r', description: 'Obfuscated transliterated slur' },
    { text: 'Will we win with Riki?', description: 'Normal text' },
    { text: "Will we win with Nature's Prophet?", description: 'Normal text' },
  ]

  // Library performance scores
  const scores: Record<string, { detected: number; total: number; rate: number }> = {
    washyourmouthoutwithsoap: { detected: 0, total: 0, rate: 0 },
    'bad-words': { detected: 0, total: 0, rate: 0 },
    'leo-profanity': { detected: 0, total: 0, rate: 0 },
    'naughty-words': { detected: 0, total: 0, rate: 0 },
    'profanity-util': { detected: 0, total: 0, rate: 0 },
    '@2toad/profanity': { detected: 0, total: 0, rate: 0 },
    obscenity: { detected: 0, total: 0, rate: 0 },
    'curse-filter': { detected: 0, total: 0, rate: 0 },
    'russian-bad-words': { detected: 0, total: 0, rate: 0 },
    'custom-wordlists': { detected: 0, total: 0, rate: 0 },
  }

  // Skip the first test case (normal text)
  const profanityTestCases = testCases.slice(1)

  for (const testCase of profanityTestCases) {
    // Process each test case with individual libraries
    console.log(`\nTesting: "${testCase.text}" (${testCase.description})`)
    console.log('Libraries that detected profanity:')

    // Test washyourmouthoutwithsoap
    const washResult = checkWashProfanity(testCase.text)
    scores.washyourmouthoutwithsoap!.total++
    if (washResult.detected) {
      scores.washyourmouthoutwithsoap!.detected++
      console.log(`- washyourmouthoutwithsoap (locale: ${washResult.locale})`)
    }

    // Test bad-words
    try {
      const badWordsResult = badWords.isProfane(testCase.text)
      scores['bad-words']!.total++
      if (badWordsResult) {
        scores['bad-words']!.detected++
        console.log('- bad-words')
      }
    } catch (error) {
      console.log('- bad-words (error)')
    }

    // Test leo-profanity
    try {
      const leoResult = leoProfanity.check(testCase.text)
      scores['leo-profanity']!.total++
      if (leoResult) {
        scores['leo-profanity']!.detected++
        console.log('- leo-profanity')
      }
    } catch (error) {
      console.log('- leo-profanity (error)')
    }

    // Test naughty-words
    try {
      let naughtyWordsDetected = false
      scores['naughty-words']!.total++

      for (const lang of Object.keys(naughtyWords)) {
        // Skip non-array properties
        if (!Array.isArray(naughtyWords[lang])) continue

        // For each language's word list
        const wordList = naughtyWords[lang] as string[]
        if (wordList.some((word) => testCase.text.toLowerCase().includes(word.toLowerCase()))) {
          naughtyWordsDetected = true
          console.log(`- naughty-words (lang: ${lang})`)
          break
        }
      }

      if (naughtyWordsDetected) {
        scores['naughty-words']!.detected++
      }
    } catch (error) {
      console.log('- naughty-words (error)')
    }

    // Test profanity-util
    try {
      const profanityUtilResult = profanityUtil.check(testCase.text)
      scores['profanity-util']!.total++
      if (profanityUtilResult[1] > 0) {
        scores['profanity-util']!.detected++
        console.log('- profanity-util')
      }
    } catch (error) {
      console.log('- profanity-util (error)')
    }

    // Test @2toad/profanity
    try {
      const toadResult = profanity.exists(testCase.text)
      scores['@2toad/profanity']!.total++
      if (toadResult) {
        scores['@2toad/profanity']!.detected++
        console.log('- @2toad/profanity')
      }
    } catch (error) {
      console.log('- @2toad/profanity (error)')
    }

    // Test obscenity
    try {
      const matches = matcher.getAllMatches(testCase.text)
      scores.obscenity!.total++
      if (matches.length > 0) {
        scores.obscenity!.detected++
        console.log('- obscenity')
      }
    } catch (error) {
      console.log('- obscenity (error)')
    }

    // Test curse-filter
    try {
      // Create variations to improve detection
      const textVariations = createTextVariations(testCase.text)
      let curseDetected = false
      scores['curse-filter']!.total++

      for (const variation of textVariations) {
        if (detect(variation)) {
          curseDetected = true
          break
        }
      }

      if (curseDetected) {
        scores['curse-filter']!.detected++
        console.log('- curse-filter')
      }
    } catch (error) {
      console.log('- curse-filter (error)')
    }

    // Test russian-bad-words
    try {
      const russianResult = checkRussianBadWords(testCase.text)
      scores['russian-bad-words']!.total++
      if (russianResult) {
        scores['russian-bad-words']!.detected++
        console.log('- russian-bad-words')
      }
    } catch (error) {
      console.log('- russian-bad-words (error)')
    }

    // Test custom wordlists
    try {
      scores['custom-wordlists']!.total++
      let customDetected = false

      if (detectMultilingualProfanity(testCase.text)) {
        customDetected = true
        console.log('- custom-wordlists (multilingual)')
      }

      if (detectRussianProfanity(testCase.text)) {
        customDetected = true
        console.log('- custom-wordlists (russian)')
      }

      if (detectChineseProfanity(testCase.text)) {
        customDetected = true
        console.log('- custom-wordlists (chinese)')
      }

      if (detectEvasionTactics(testCase.text)) {
        customDetected = true
        console.log('- custom-wordlists (evasion)')
      }

      if (customDetected) {
        scores['custom-wordlists']!.detected++
      }
    } catch (error) {
      console.log('- custom-wordlists (error)')
    }
  }

  // Calculate detection rates
  for (const lib in scores) {
    scores[lib]!.rate = (scores[lib]!.detected / scores[lib]!.total) * 100
  }

  // Rank libraries by detection rate
  const rankedLibraries = Object.entries(scores)
    .sort((a, b) => b[1].rate - a[1].rate)
    .map(([name, stats]) => ({ name, ...stats }))

  console.log('\n=== LIBRARY DETECTION RANKING ===')
  console.log('Rank | Library | Detection Rate | Detected / Total')
  console.log('-'.repeat(60))

  rankedLibraries.forEach((lib, index) => {
    console.log(
      `${index + 1}.   | ${lib.name.padEnd(22)} | ${lib.rate.toFixed(1)}% | ${lib.detected}/${lib.total}`,
    )
  })
}

// Run main test and then compare libraries
async function main() {
  // await runTest()
  // await compareLibraries()
}

main().catch((err) => {
  console.error('Error running tests:', err)
})
