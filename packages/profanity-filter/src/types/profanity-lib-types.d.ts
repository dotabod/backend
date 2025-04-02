/**
 * Type declarations for profanity filtering libraries without TypeScript types
 */

declare module 'bad-words' {
  export class Filter {
    constructor(options?: {
      emptyList?: boolean
      exclude?: string[]
      placeHolder?: string
      list?: string[]
      regex?: RegExp
    })
    isProfane(text: string): boolean
    clean(text: string): string
    addWords(...words: string[]): void
    removeWords(...words: string[]): void
  }
}

declare module 'profanity-filter' {
  export class ProfanityFilter {
    isProfane(text: string): boolean
    clean(text: string): string
    addWords(words: string[]): void
    removeWords(words: string[]): void
  }
}

declare module 'profanity-util' {
  interface ProfanityUtil {
    check(text: string | string[]): [string[], number]
    purify(text: string | string[]): [string | string[], number]
    addWords(words: string | string[]): string[]
    removeWords(words: string | string[]): string[]
    getDictionary(): string[]
  }

  const profanityUtil: ProfanityUtil
  export default profanityUtil
}

declare module 'russian-bad-words' {
  export interface Word {
    [key: string]: string
  }

  export const words: Word[]
  export const flatWords: string[]
}

declare module 'washyourmouthoutwithsoap' {
  export interface Wash {
    supported(): string[] // Returns supported locale codes (ISO 639-1)
    check(locale: string, text: string): boolean // Checks if text contains bad words for the specified locale
    words(locale: string): string[] // Returns all bad words for the specified locale
  }

  const wash: Wash
  export default wash
}
