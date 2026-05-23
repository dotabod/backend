import { describe, it } from 'vite-plus/test'
// @ts-expect-error no types
import Steam from 'steam'

// Live end-to-end probe against a real Steam CM. Skipped unless STEAM_LIVE=1
// because it touches the public internet and depends on Steam being healthy.
// What it proves: TCP connect + the encrypted-handshake first packet
// (`encryptionRequest`) survives the round-trip through node-steam's readable-
// stream framing under bun.
const live = process.env.STEAM_LIVE === '1'
const maybe = live ? describe : describe.skip

maybe('Steam CM live connect (STEAM_LIVE=1)', () => {
  it('receives an encryptionRequest within 10s and then disconnects cleanly', async () => {
    const client = new Steam.SteamClient()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          client.disconnect()
        } catch {}
        reject(new Error('no encryptionRequest within 10s'))
      }, 10_000)
      client.on('connected', () => {
        // The 'connected' event in node-steam fires after the
        // encryptionRequest+response handshake succeeds.
        clearTimeout(timer)
        client.disconnect()
        resolve()
      })
      client.on('error', (err: unknown) => {
        clearTimeout(timer)
        reject(err as Error)
      })
      client.connect()
    })
  })
})
