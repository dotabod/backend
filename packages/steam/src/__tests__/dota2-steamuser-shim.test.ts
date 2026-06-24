// Explicit node types reference — vp staged runs single-file lint and doesn't
// pick up the package's @types/node from the workspace tree (.test.ts is
// excluded from tsconfig), so without this it spuriously errors on Buffer /
// node:events / EventEmitter below.
/// <reference types="node" />
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vite-plus/test'
import {
  SteamGameCoordinatorShim,
  type SteamUserClient,
  SteamUserShim,
} from '../utils/dota2SteamUser'

const DOTA_APP_ID = 570

// Minimal stand-in for a steam-user instance: records sendToGC calls (so we can
// later invoke the stored job callback) and is an EventEmitter so we can emit
// 'receivedFromGC' at it.
class FakeSteamUser extends EventEmitter {
  steamID = { toString: () => '76561198000000000' }
  loggedOn = false
  sentToGC: Array<{
    appid: number
    msgType: number
    header: Record<string, unknown> | null
    body: Buffer
    callback?: (appid: number, msgType: number, payload: Buffer) => void
  }> = []
  playedApps: unknown[] = []

  sendToGC(
    appid: number,
    msgType: number,
    header: Record<string, unknown> | null,
    body: Buffer,
    callback?: (appid: number, msgType: number, payload: Buffer) => void,
  ) {
    this.sentToGC.push({ appid, msgType, header, body, callback })
  }

  gamesPlayed(apps: unknown) {
    this.playedApps.push(apps)
  }
}

const asClient = (u: FakeSteamUser): SteamUserClient => u as unknown as SteamUserClient

describe('SteamGameCoordinatorShim', () => {
  it('maps v1 .send() to sendToGC on the protobuf path (header {}, no mask handling)', () => {
    const user = new FakeSteamUser()
    const gc = new SteamGameCoordinatorShim(asClient(user), DOTA_APP_ID)

    const body = Buffer.from([1, 2, 3])
    gc.send({ msg: 4006 /* k_EMsgGCClientHello */, proto: {} }, body)

    expect(user.sentToGC).toHaveLength(1)
    const call = user.sentToGC[0]
    expect(call.appid).toBe(DOTA_APP_ID)
    expect(call.msgType).toBe(4006)
    expect(call.header).toEqual({})
    expect(call.body).toEqual(body)
    expect(call.callback).toBeUndefined()
  })

  it('converts a Uint8Array body to a Buffer for sendToGC', () => {
    const user = new FakeSteamUser()
    const gc = new SteamGameCoordinatorShim(asClient(user), DOTA_APP_ID)

    gc.send({ msg: 4006, proto: {} }, Uint8Array.from([9, 8, 7]))

    expect(Buffer.isBuffer(user.sentToGC[0].body)).toBe(true)
    expect(user.sentToGC[0].body).toEqual(Buffer.from([9, 8, 7]))
  })

  it('routes a job response back to the v1-style (header, body) callback', () => {
    const user = new FakeSteamUser()
    const gc = new SteamGameCoordinatorShim(asClient(user), DOTA_APP_ID)

    let received: { header: unknown; body: Buffer } | undefined
    gc.send({ msg: 7000, proto: {} }, Buffer.from([9]), (header, respBody) => {
      received = { header, body: respBody }
    })

    const jobCb = user.sentToGC[0].callback
    expect(jobCb).toBeTypeOf('function')

    // steam-user invokes the job callback with (appid, msgType, payload).
    const resp = Buffer.from([4, 5, 6])
    jobCb?.(DOTA_APP_ID, 7001, resp)

    // node-dota2 expects (header{msg}, body); only msg + body are read.
    expect(received?.header).toEqual({ msg: 7001, proto: {} })
    expect(received?.body).toEqual(resp)
  })

  it("re-emits non-job GC pushes as a v1 'message' event (callback null)", () => {
    const user = new FakeSteamUser()
    const gc = new SteamGameCoordinatorShim(asClient(user), DOTA_APP_ID)

    const events: Array<{ header: unknown; body: Buffer; cb: unknown }> = []
    gc.on('message', (header: unknown, body: Buffer, cb: unknown) =>
      events.push({ header, body, cb }),
    )

    const payload = Buffer.from([7, 7, 7])
    user.emit('receivedFromGC', DOTA_APP_ID, 4004 /* k_EMsgGCClientWelcome */, payload)

    expect(events).toHaveLength(1)
    expect(events[0].header).toEqual({ msg: 4004, proto: {} })
    expect(events[0].body).toEqual(payload)
    expect(events[0].cb).toBeNull()
  })

  it('ignores receivedFromGC for other appids', () => {
    const user = new FakeSteamUser()
    const gc = new SteamGameCoordinatorShim(asClient(user), DOTA_APP_ID)

    const events: unknown[] = []
    gc.on('message', (...args: unknown[]) => events.push(args))

    user.emit('receivedFromGC', 730 /* CS:GO */, 4004, Buffer.from([0]))

    expect(events).toHaveLength(0)
  })
})

describe('SteamUserShim', () => {
  it('forwards gamesPlayed (node-dota2 launch/exit) to the steam-user instance', () => {
    const user = new FakeSteamUser()
    const shim = new SteamUserShim(asClient(user))

    shim.gamesPlayed([{ game_id: DOTA_APP_ID }])
    shim.gamesPlayed([])

    expect(user.playedApps).toEqual([[{ game_id: DOTA_APP_ID }], []])
  })
})
