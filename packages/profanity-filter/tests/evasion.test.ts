import { describe, expect, test } from 'bun:test'
import { getProfanityDetails, moderateText } from '../src/utils/moderation.js'
import {
  detectAgeRestrictions,
  detectEvasionTactics,
  detectTransphobicContent,
} from '../src/utils/profanity-wordlists.js'

// Helper function for testing
async function testBadPhrase(phrase: string, description: string) {
  test(`should detect ${description}`, async () => {
    const moderated = await moderateText(phrase)
    expect(moderated).not.toBe(phrase)
    expect(moderated).toContain('***')

    const details = getProfanityDetails(phrase) as {
      isFlagged: boolean
      source: string
      matches?: string[]
      language?: string
    }
    expect(details.isFlagged).toBe(true)
  })
}

describe('Enhanced Evasion Detection', () => {
  describe('Age-related content detection', () => {
    testBadPhrase("I'm 12", 'explicit age statement')
    testBadPhrase('i m 1 2', 'spaced digits in age')
    testBadPhrase('i.m.1.2', 'dotted age statement')
    testBadPhrase('i-am-10-years-old', 'hyphenated age statement')
    testBadPhrase('iam11', 'merged age statement without spaces')
    testBadPhrase('I am twelve years old', 'age spelled out as word')
    testBadPhrase('Im ten', 'age as word without apostrophe')
    testBadPhrase('j_u_s_t__t_u_r_n_e_d__1_1', 'underscored age phrase')
    testBadPhrase('im  a    minor', 'spaced out minor statement')
    testBadPhrase("i ' m   u n d e r a g e", 'spaced out underage statement')
  })

  describe('Transphobic content detection', () => {
    testBadPhrase('tr@ns is a mental illness', 'character substitution')
    testBadPhrase("tr4nsgender people aren't re4l", 'number substitution')
    testBadPhrase('tr.a.n.s.g.e.n.d.e.r.i.s.m is a delusion', 'period-separated hateful phrase')
    testBadPhrase('t_r_a_n_s p_e_o_p_l_e a_r_e s_i_c_k', 'underscore-separated hateful phrase')
    testBadPhrase('tr a ns  peo ple   a re    gro o me rs', 'irregular spacing')
    testBadPhrase('tr4nn¡3s are sick', 'mixed character substitution')
    testBadPhrase('sh3m4l3', 'leetspeak slur')
    testBadPhrase('t-rann-y', 'hyphenated slur')
    testBadPhrase('tr@n$ @g3nd@', 'mixed special character substitution')
    testBadPhrase('gender.is.determined.by.biology', 'period-separated gender essentialism')
  })

  describe('Profanity evasion tactics', () => {
    testBadPhrase('f u c k', 'spaced profanity')
    testBadPhrase('f.u.c.k', 'period-separated profanity')
    testBadPhrase('f*u*c*k', 'star-separated profanity')
    testBadPhrase('f_u_c_k', 'underscore-separated profanity')
    testBadPhrase('f-u-c-k', 'hyphen-separated profanity')
    testBadPhrase('f+u+c+k', 'plus-separated profanity')
    testBadPhrase('f#u#c#k', 'hash-separated profanity')
    testBadPhrase('$h!t', 'character substitution profanity')
    testBadPhrase('@$$h0le', 'aggressive character substitution')
    testBadPhrase('fffffffffuuuuuuuuucccccccckkkkkkkk', 'elongated profanity')
    testBadPhrase('s h i i i i i i t', 'mixed spacing and character repetition')
    testBadPhrase('n1gg3r', 'leetspeak racial slur')
    testBadPhrase('n!994', 'mixed characters racial slur')
    testBadPhrase('ƒυcκ', 'unicode character substitution')
    testBadPhrase('ßitch', 'unicode character substitution')
  })

  describe('Mixed or creative evasion methods', () => {
    testBadPhrase('f(asterisk)u(asterisk)c(asterisk)k', 'described separator profanity')
    testBadPhrase('f__u__c__k', 'double separator profanity')
    testBadPhrase('f-u_c.k', 'mixed separator profanity')
    testBadPhrase('f u  c   k', 'irregular spacing profanity')
    testBadPhrase('fＵck', 'fullwidth unicode character substitution')
    testBadPhrase('𝐟𝐮𝐜𝐤', 'mathematical bold unicode substitution')
    testBadPhrase('f(u)c{k}', 'parenthesis/bracket enclosed characters')
    testBadPhrase('s⃣h⃣i⃣t⃣', 'emoji enclosed characters')
    testBadPhrase('/\\/\\utherFucker', 'ASCII art substitution')
    testBadPhrase('ʂɧıɬ', 'ɪᴘᴀ character substitution')
  })
})
