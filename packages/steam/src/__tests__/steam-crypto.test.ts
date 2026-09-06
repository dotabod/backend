// @ts-expect-error no types
import steamCrypto from 'steam-crypto'
import { describe, expect, it } from 'vitest'

describe('steam-crypto (node:crypto under bun)', () => {
  it('generateSessionKey returns a 32-byte plain key and a 128-byte RSA-encrypted blob', () => {
    const session = steamCrypto.generateSessionKey()
    expect(Buffer.isBuffer(session.plain)).toBeTruthy()
    expect(session.plain).toHaveLength(32)
    expect(Buffer.isBuffer(session.encrypted)).toBeTruthy()
    // Steam's pub key is RSA-1024 → encrypted output is 128 bytes
    expect(session.encrypted).toHaveLength(128)
  })

  it('symmetricEncrypt/Decrypt round-trips an arbitrary plaintext', () => {
    const session = steamCrypto.generateSessionKey()
    const plaintext = Buffer.from('the quick brown fox jumps over the lazy dog')
    const enc = steamCrypto.symmetricEncrypt(plaintext, session.plain)
    expect(Buffer.isBuffer(enc)).toBeTruthy()
    expect(enc.length).toBeGreaterThan(plaintext.length)

    const dec = steamCrypto.symmetricDecrypt(enc, session.plain)
    expect(dec.toString()).toBe(plaintext.toString())
  })
})
