import { describe, expect, test } from 'bun:test'
import { getProfanityDetails, moderateText } from '../src/utils/moderation.js'
import {
  detectEvasionTactics,
  detectMultilingualProfanity,
  detectRussianProfanity,
} from '../src/utils/profanity-wordlists.js'

describe('Profanity Filter', () => {
  describe('Basic profanity detection', () => {
    test('should not flag normal text', async () => {
      const normal = 'Hello world, this is a normal text.'
      const moderated = await moderateText(normal)
      expect(moderated).toBe(normal)

      const details = getProfanityDetails(normal) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(false)
      expect(details.source).toBe('none')
    })

    test('should not flag "Will we win with Riki?"', async () => {
      const text = 'Will we win with Riki?'
      const moderated = await moderateText(text)
      expect(moderated).toBe(text)

      const details = getProfanityDetails(text) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(false)
      expect(details.source).toBe('none')

      // Make sure individual detectors don't flag it either
      expect(detectMultilingualProfanity(text)).toBe(false)
      expect(detectEvasionTactics(text)).toBe(false)
    })

    test('should detect compressed profanity', async () => {
      const compressedWords = ['fuuuuck', 'shiiiit', 'asssss', 'f*u*c*k', 'sh!t', 'b!tch']

      for (const word of compressedWords) {
        const profane = `This contains a compressed bad word: ${word}`
        const moderated = await moderateText(profane)
        expect(moderated).not.toBe(profane)
        expect(moderated).toContain('***')

        const details = getProfanityDetails(profane) as {
          isFlagged: boolean
          source: string
          matches?: string[]
          language?: string
        }
        expect(details.isFlagged).toBe(true)
      }
    })

    test('should detect profanity with character repetition', async () => {
      // Test words with repeated characters that should be compressed
      const texts = [
        'fuuuuuuuck youuuu',
        'shiiiiiiiit',
        'what the fuuuuuck',
        'aaaaaassssss',
        'biiiiiitch',
      ]

      for (const text of texts) {
        const moderated = await moderateText(text)
        expect(moderated).not.toBe(text)
        expect(moderated).toContain('***')

        const details = getProfanityDetails(text) as {
          isFlagged: boolean
          source: string
          matches?: string[]
          language?: string
        }
        expect(details.isFlagged).toBe(true)
      }
    })

    test('should detect profanity with evasion tactics', async () => {
      const evasionTexts = [
        'f u c k',
        'f.u.c.k',
        'f*u*c*k',
        's-h-i-t',
        'b i t c h',
        'f_u_c_k',
        's.h.i.t',
      ]

      for (const text of evasionTexts) {
        expect(detectEvasionTactics(text)).toBe(true)

        const moderated = await moderateText(text)
        expect(moderated).not.toBe(text)
        expect(moderated).toContain('***')

        const details = getProfanityDetails(text) as {
          isFlagged: boolean
          source: string
          matches?: string[]
          language?: string
        }
        expect(details.isFlagged).toBe(true)
      }
    })

    test('should detect more simple profanity', async () => {
      const badWords = [
        'trans',
        'transgender',
        'transsexual',
        'transvestite',
        'im 12',
        'jewed',
        'fuck',
        'shit',
        'nigger',
        'n1gga',
        'nigga',
        'nig',
        'transnigger',
        'transniqger',
      ]

      for (const word of badWords) {
        const profane = `This contains a bad word: ${word}`
        const moderated = await moderateText(profane)

        const details = getProfanityDetails(profane) as {
          isFlagged: boolean
          source: string
          matches?: string[]
          language?: string
        }
        console.log({ details, word }, 'geczy')
        expect(moderated).not.toBe(profane)
        expect(moderated).toContain('***')

        expect(details.isFlagged).toBe(true)
        if (details.matches && details.matches.length > 0) {
          // Check if the word includes the match OR the match includes the word
          // This handles cases like "nig" matching "ni" from obscenity library
          expect(word.includes(details.matches[0]) || details.matches[0].includes(word)).toBe(true)
        }
      }

      // Test array input for getProfanityDetails
      const profaneTexts = badWords.map((word) => `This contains a bad word: ${word}`)
      const detailsArray = getProfanityDetails(profaneTexts) as Array<{
        text: string
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }>

      expect(Array.isArray(detailsArray)).toBe(true)
      expect(detailsArray.length).toBe(badWords.length)
      detailsArray.forEach((detail, index) => {
        expect(detail.isFlagged).toBe(true)
        if (detail.matches) {
          expect(detail.matches).toBeDefined()
          expect(
            detail.matches?.includes(badWords[index]) ||
              badWords[index].includes(detail.matches?.[0] ?? ''),
          ).toBe(true)
        }
      })
    })

    test('should detect simple profanity', async () => {
      const profane = 'This contains a bad word: fuck'
      const moderated = await moderateText(profane)
      expect(moderated).not.toBe(profane)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(profane) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)
    })
  })

  describe('Obfuscated profanity detection', () => {
    test('should detect spaced profanity', async () => {
      const spaced = 'f u c k'
      const moderated = await moderateText(spaced)
      expect(moderated).not.toBe(spaced)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(spaced) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)
    })

    test('should detect starred profanity', async () => {
      const starred = 'f*u*c*k'
      const moderated = await moderateText(starred)
      expect(moderated).not.toBe(starred)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(starred) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)
    })

    test('should detect stretched characters', async () => {
      const stretched = 'Fuuuuuuck'
      const moderated = await moderateText(stretched)
      expect(moderated).not.toBe(stretched)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(stretched) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)
    })

    test('should detect punctuated profanity', async () => {
      const punctuated = 'F.u.c.k'
      const moderated = await moderateText(punctuated)
      expect(moderated).not.toBe(punctuated)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(punctuated) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)
    })

    test('should detect leet speak', async () => {
      const leet = "That's a5s"
      const moderated = await moderateText(leet)
      expect(moderated).not.toBe(leet)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(leet) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)
    })
  })

  describe('Multilingual profanity detection', () => {
    test('should detect Russian profanity', async () => {
      const russian = 'сука блять'
      const moderated = await moderateText(russian)
      expect(moderated).not.toBe(russian)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(russian) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)

      expect(detectRussianProfanity(russian)).toBe(true)
    })

    test('should detect Spanish profanity', async () => {
      const spanish = 'hijo de puta'
      const moderated = await moderateText(spanish)
      expect(moderated).not.toBe(spanish)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(spanish) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)
    })

    test('should detect German profanity', async () => {
      const german = 'scheiße'
      const moderated = await moderateText(german)
      expect(moderated).not.toBe(german)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(german) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)
    })
  })

  describe('Advanced obfuscation techniques', () => {
    test('should detect unicode substitution', async () => {
      const unicode = 'ƒʊ¢κ'
      const moderated = await moderateText(unicode)
      expect(moderated).not.toBe(unicode)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(unicode) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)
    })

    test('should detect embedded profanity', async () => {
      const embedded = 'wordsbeforefuckandafter'
      const moderated = await moderateText(embedded)
      expect(moderated).not.toBe(embedded)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(embedded) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)
    })

    test('should detect mixed language slurs', async () => {
      const mixed = 'Это chink из китая'
      const moderated = await moderateText(mixed)
      expect(moderated).not.toBe(mixed)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(mixed) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)
    })

    test('should detect obfuscated transliterated slurs', async () => {
      const obfuscated = 'Типичный n1gg3r'
      const moderated = await moderateText(obfuscated)
      expect(moderated).not.toBe(obfuscated)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(obfuscated) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)
    })
  })

  describe('Transphobic content detection', () => {
    test('should detect transphobic hate speech phrases', async () => {
      const transphobicPhrases = [
        { phrase: 'trans is a mental illness', match: 'trans' },
        { phrase: 'transgender people are mentally ill', match: 'transgender' },
        { phrase: 'transgenderism is a delusion', match: 'transgender' },
        { phrase: 'transsexuals are delusional', match: 'transsexual' },
        { phrase: 'trans people aren\'t real women', match: 'trans' },
        { phrase: 'trans ideology is dangerous', match: 'trans' },
        { phrase: 'trans agenda in schools', match: 'trans' },
        { phrase: 'only two genders exist', match: null },
        { phrase: 'gender is determined by biology', match: null },
        { phrase: 'trans is against nature', match: 'trans' },
        { phrase: 'trannies are sick', match: 'tranny' },
        { phrase: 'trans people are groomers', match: 'trans' },
      ]

      for (const { phrase, match } of transphobicPhrases) {
        const moderated = await moderateText(phrase)
        expect(moderated).not.toBe(phrase)
        expect(moderated).toContain('***')

        const details = getProfanityDetails(phrase) as {
          isFlagged: boolean
          source: string
          matches?: string[]
          language?: string
        }
        
        console.log({ phrase, details, match }, 'testing')
        expect(details.isFlagged).toBe(true)
        expect(details.source).toBe('hate-speech')
        
        if (match && details.matches && details.matches.length > 0) {
          expect(details.matches[0]).toBe(match)
        }
      }
    })
  })

  describe('False positives prevention', () => {
    test('should not flag innocent words containing profanity substrings', async () => {
      const words = [
        'AM',
        'Hollaw',
        'Delight',
        'Yamato',
        'Kataraménos',
        'Cuziloveyou',
        'coldofff',
        '555',
        'fax666.',
        'fakejoker',
        'Classic', // contains "ass"
        'Scunthorpe', // contains "cunt"
        'Assassin', // contains "ass" twice
        'Cockpit', // contains "cock"
        'Shuttlecock', // contains "cock"
        'Analysis', // contains "anal"
        'Grape', // contains "rape"
        'Therapist', // contains "rapist"
      ]

      for (const word of words) {
        const moderated = await moderateText(word)

        const details = getProfanityDetails(word) as {
          isFlagged: boolean
          source: string
          matches?: string[]
          language?: string
        }
        console.log({ word, moderated, details }, 'Checking word for false positive')
        expect(moderated).toBe(word)
        expect(details.isFlagged).toBe(false)
      }
    })

    test('should not flag common English phrases', async () => {
      const phrases = [
        'Will we win with Riki?',
        "Will we win with Nature's Prophet?",
        'The competition is so intense',
        'He has a good skill set',
        "Let's meet at the cocktail bar",
        'The documentation is helpful',
        'This is exceptional work',
        'That is a beautiful sunset',
      ]

      for (const phrase of phrases) {
        const moderated = await moderateText(phrase)
        expect(moderated).toBe(phrase)

        const details = getProfanityDetails(phrase) as {
          isFlagged: boolean
          source: string
          matches?: string[]
          language?: string
        }
        expect(details.isFlagged).toBe(false)
      }
    })
  })
})
