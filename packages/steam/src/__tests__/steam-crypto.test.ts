import { describe, expect, it } from 'bun:test'

// @ts-expect-error no types
import steamCrypto from 'steam-crypto'

describe('steam-crypto (node:crypto under bun)', () => {
  it('generateSessionKey returns a 32-byte plain key and a 128-byte RSA-encrypted blob', () => {
    const session = steamCrypto.generateSessionKey()
    expect(Buffer.isBuffer(session.plain)).toBe(true)
    expect(session.plain.length).toBe(32)
    expect(Buffer.isBuffer(session.encrypted)).toBe(true)
    // Steam's pub key is RSA-1024 → encrypted output is 128 bytes
    expect(session.encrypted.length).toBe(128)
  })

  it('symmetricEncrypt/Decrypt round-trips an arbitrary plaintext', () => {
    const session = steamCrypto.generateSessionKey()
    const plaintext = Buffer.from('the quick brown fox jumps over the lazy dog')
    const enc = steamCrypto.symmetricEncrypt(plaintext, session.plain)
    expect(Buffer.isBuffer(enc)).toBe(true)
    expect(enc.length).toBeGreaterThan(plaintext.length)

    const dec = steamCrypto.symmetricDecrypt(enc, session.plain)
    expect(dec.toString()).toBe(plaintext.toString())
  })
})
