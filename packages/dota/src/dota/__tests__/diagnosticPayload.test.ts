import { gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { DIAGNOSTIC_PAYLOAD_BYTES, getDiagnosticPayload } from '../diagnosticPayload'

describe('GSI diagnostic payload', () => {
  it('is large enough to detect connections truncated after the first 16 KB', () => {
    const payload = getDiagnosticPayload()
    expect(Buffer.byteLength(payload)).toBe(DIAGNOSTIC_PAYLOAD_BYTES)
    expect(DIAGNOSTIC_PAYLOAD_BYTES).toBeGreaterThan(16 * 1024)
    expect(gzipSync(payload).byteLength).toBeGreaterThan(48 * 1024)
  })
})
