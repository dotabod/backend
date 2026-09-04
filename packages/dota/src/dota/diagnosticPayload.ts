export const DIAGNOSTIC_PAYLOAD_BYTES = 64 * 1024

const payload = Buffer.allocUnsafe(DIAGNOSTIC_PAYLOAD_BYTES)
let state = 0x1a2b3c4d
for (let index = 0; index < payload.length; index += 1) {
  state ^= state << 13
  state ^= state >>> 17
  state ^= state << 5
  payload[index] = state & 0xff
}

export function getDiagnosticPayload(): Buffer {
  return payload
}
