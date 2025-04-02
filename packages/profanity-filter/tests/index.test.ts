import { describe, expect, test } from 'bun:test'
import { moderateText, getProfanityDetails } from '../src/utils/moderation'
import {
  detectMultilingualProfanity,
  detectRussianProfanity,
  detectChineseProfanity,
  detectEvasionTactics,
} from '../src/utils/profanity-wordlists'

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

    test('should detect Chinese profanity', async () => {
      const chinese = '操你妈'
      const moderated = await moderateText(chinese)
      expect(moderated).not.toBe(chinese)
      expect(moderated).toContain('***')

      const details = getProfanityDetails(chinese) as {
        isFlagged: boolean
        source: string
        matches?: string[]
        language?: string
      }
      expect(details.isFlagged).toBe(true)

      expect(detectChineseProfanity(chinese)).toBe(true)
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

  describe('False positives prevention', () => {
    test('should not flag innocent words containing profanity substrings', async () => {
      const words = [
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
        expect(moderated).toBe(word)

        const details = getProfanityDetails(word) as {
          isFlagged: boolean
          source: string
          matches?: string[]
          language?: string
        }
        expect(details.isFlagged).toBe(false)
      }
    })

    test('should not flag common English phrases', async () => {
      const phrases = [
        'Will we win with Riki?',
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
