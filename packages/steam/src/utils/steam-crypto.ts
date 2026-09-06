import { createRequire } from 'node:module'

import { z } from 'zod'

const bufferSchema = z.instanceof(Buffer)
const sessionKeySchema = z.object({
  encrypted: bufferSchema,
  plain: bufferSchema,
})
const steamCryptoSchema = z.object({
  generateSessionKey: z.function({ input: [], output: sessionKeySchema }),
  symmetricDecrypt: z.function({
    input: [bufferSchema, bufferSchema],
    output: bufferSchema,
  }),
  symmetricEncrypt: z.function({
    input: [bufferSchema, bufferSchema],
    output: bufferSchema,
  }),
})

const loadCommonJsModule = createRequire(import.meta.url)
export const steamCrypto = steamCryptoSchema.parse(loadCommonJsModule('steam-crypto'))
