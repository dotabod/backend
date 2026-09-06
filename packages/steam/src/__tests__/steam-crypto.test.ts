import { describe, expect, it } from 'vitest'

import { steamCrypto } from '../utils/steam-crypto.ts'

describe('steam-crypto (node:crypto under bun)', () => {
  it('generateSessionKey returns a 32-byte plain key and a 128-byte RSA-encrypted blob', () => {
    const session = steamCrypto.generateSessionKey()
    expect({
      encryptedLength: session.encrypted.length,
      plainLength: session.plain.length,
    }).toStrictEqual({
      encryptedLength: 128,
      plainLength: 32,
    })
  })

  it('symmetricEncrypt/Decrypt round-trips an arbitrary plaintext', () => {
    const session = steamCrypto.generateSessionKey()
    const plaintext = session.plain.subarray(0, 17)
    const encrypted = steamCrypto.symmetricEncrypt(plaintext, session.plain)
    const decrypted = steamCrypto.symmetricDecrypt(encrypted, session.plain)

    expect(decrypted.equals(plaintext)).toBeTruthy()
  })
})
