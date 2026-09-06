// Explicit node types reference — staged single-file lint and doesn't
// pick up the package's @types/node from the workspace tree (.test.ts is
// excluded from tsconfig), so without this it spuriously errors on Buffer /
// node:events / EventEmitter below.
/// <reference types="node" />
import { EventEmitter } from 'node:events'

import { describe, expect, it } from 'vitest'

import { SteamGameCoordinatorShim, SteamUserShim } from '../utils/dota2-steam-user'
import type { SteamUserClient } from '../utils/dota2-steam-user'

const DOTA_APP_ID = 570

// Minimal stand-in for a steam-user instance: records sendToGC calls (so we can
// later invoke the stored job callback) and is an EventEmitter so we can emit
// 'receivedFromGC' at it.
class FakeSteamUser extends EventEmitter {
  steamID = { toString: () => '76561198000000000' }
  loggedOn = false
  sentToGC: {
    appid: number
    msgType: number
    header: Record<string, unknown> | null
    body: Buffer
    callback?: (appid: number, msgType: number, payload: Buffer) => void
  }[] = []
  playedApps: unknown[] = []

  sendToGC(
    appid: number,
    msgType: number,
    header: Record<string, unknown> | null,
    body: Buffer,
    callback?: (appid: number, msgType: number, payload: Buffer) => void
  ) {
    this.sentToGC.push({ appid, body, callback, header, msgType })
  }

  gamesPlayed(apps: unknown) {
    this.playedApps.push(apps)
  }
}

const asClient = (u: FakeSteamUser): SteamUserClient => u as unknown as SteamUserClient

describe(SteamGameCoordinatorShim, () => {
  it('maps v1 .send() to sendToGC on the protobuf path (header {}, no mask handling)', () => {
    const user = new FakeSteamUser()
    const gc = new SteamGameCoordinatorShim(asClient(user), DOTA_APP_ID)

    const body = Buffer.from([1, 2, 3])
    // 4006 is k_EMsgGCClientHello.
    gc.send({ msg: 4006, proto: {} }, body)

    expect(user.sentToGC).toHaveLength(1)
    const call = user.sentToGC[0]
    expect(call.appid).toBe(DOTA_APP_ID)
    expect(call.msgType).toBe(4006)
    expect(call.header).toStrictEqual({})
    expect(call.body).toStrictEqual(body)
    expect(call.callback).toBeUndefined()
  })

  it('converts a Uint8Array body to a Buffer for sendToGC', () => {
    const user = new FakeSteamUser()
    const gc = new SteamGameCoordinatorShim(asClient(user), DOTA_APP_ID)

    gc.send({ msg: 4006, proto: {} }, Uint8Array.from([9, 8, 7]))

    expect(Buffer.isBuffer(user.sentToGC[0].body)).toBeTruthy()
    expect(user.sentToGC[0].body).toStrictEqual(Buffer.from([9, 8, 7]))
  })

  it('routes a job response back to the v1-style (header, body) callback', () => {
    const user = new FakeSteamUser()
    const gc = new SteamGameCoordinatorShim(asClient(user), DOTA_APP_ID)

    let received: { header: unknown; body: Buffer } | undefined
    gc.send({ msg: 7000, proto: {} }, Buffer.from([9]), (header, respBody) => {
      received = { body: respBody, header }
    })

    const jobCb = user.sentToGC[0].callback
    expect(jobCb).toBeTypeOf('function')

    // steam-user invokes the job callback with (appid, msgType, payload).
    const resp = Buffer.from([4, 5, 6])
    jobCb?.(DOTA_APP_ID, 7001, resp)

    // node-dota2 expects (header{msg}, body); only msg + body are read.
    expect(received?.header).toStrictEqual({ msg: 7001, proto: {} })
    expect(received?.body).toStrictEqual(resp)
  })

  it("re-emits non-job GC pushes as a v1 'message' event (callback null)", () => {
    const user = new FakeSteamUser()
    const gc = new SteamGameCoordinatorShim(asClient(user), DOTA_APP_ID)

    const events: { header: unknown; body: Buffer; cb: unknown }[] = []
    gc.on('message', (header: unknown, body: Buffer, cb: unknown) =>
      events.push({ body, cb, header })
    )

    const payload = Buffer.from([7, 7, 7])
    // 4004 is k_EMsgGCClientWelcome.
    user.emit('receivedFromGC', DOTA_APP_ID, 4004, payload)

    expect(events).toHaveLength(1)
    expect(events[0].header).toStrictEqual({ msg: 4004, proto: {} })
    expect(events[0].body).toStrictEqual(payload)
    expect(events[0].cb).toBeNull()
  })

  it('ignores receivedFromGC for other appids', () => {
    const user = new FakeSteamUser()
    const gc = new SteamGameCoordinatorShim(asClient(user), DOTA_APP_ID)

    const events: unknown[] = []
    gc.on('message', (...args: unknown[]) => events.push(args))

    // 730 is CS:GO.
    user.emit('receivedFromGC', 730, 4004, Buffer.from([0]))

    expect(events).toHaveLength(0)
  })
})

describe(SteamUserShim, () => {
  it('forwards gamesPlayed (node-dota2 launch/exit) to the steam-user instance', () => {
    const user = new FakeSteamUser()
    const shim = new SteamUserShim(asClient(user))

    shim.gamesPlayed([{ game_id: DOTA_APP_ID }])
    shim.gamesPlayed([])

    expect(user.playedApps).toStrictEqual([[{ game_id: DOTA_APP_ID }], []])
  })
})
