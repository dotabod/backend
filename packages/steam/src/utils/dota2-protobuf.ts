import { createRequire } from 'node:module'

import type Long from 'long'
import { z } from 'zod'

interface SpectateFriendGameMessage {
  toBuffer: () => Buffer
}

interface SpectateFriendGameInput {
  live: boolean
  steamId: Long
}

interface SpectateFriendGameResult {
  live: boolean
  steamId: string
}

interface SpectateFriendGameResponseInput {
  serverSteamId: Long
  watchLiveResult: number
}

interface SpectateFriendGameResponseResult {
  serverSteamId: string
  watchLiveResult: number
}

interface StringableLong {
  toString: () => string
}

interface SpectateFriendGameFields {
  live?: boolean
  steam_id?: Long
}

interface SpectateFriendGameResponseFields {
  server_steamid?: Long
  watch_live_result?: number
}

type ProtobufMessageFields = SpectateFriendGameFields | SpectateFriendGameResponseFields

interface ProtobufMessageConstructor {
  new (fields: ProtobufMessageFields): SpectateFriendGameMessage
  decode: (buffer: Buffer) => object
}

const bufferSchema = z.instanceof(Buffer)
const messageContract = z.object({
  toBuffer: z.function({ input: [], output: bufferSchema }),
})
const messageSchema = z.custom<SpectateFriendGameMessage>(
  (candidate) => messageContract.safeParse(candidate).success
)
const longValueContract = z.object({
  toString: z.function({ input: [], output: z.string() }),
})
const longValueSchema = z.custom<StringableLong>(
  (candidate) => longValueContract.safeParse(candidate).success
)
const spectateFriendGameResultSchema = z.object({
  live: z.boolean(),
  steam_id: longValueSchema,
})
const spectateFriendGameResponseSchema = z.object({
  server_steamid: longValueSchema,
  watch_live_result: z.number(),
})
const messageConstructorSchema = z.custom<ProtobufMessageConstructor>((candidate) => {
  if (
    !(candidate instanceof Object) ||
    Object.prototype.toString.call(candidate) !== '[object Function]'
  ) {
    return false
  }
  if (!('decode' in candidate)) {
    return false
  }
  return Object.prototype.toString.call(candidate.decode) === '[object Function]'
})
const dota2ModuleSchema = z.object({
  schema: z.object({
    CMsgSpectateFriendGame: messageConstructorSchema,
    CMsgSpectateFriendGameResponse: messageConstructorSchema,
  }),
})

const loadCommonJsModule = createRequire(import.meta.url)
const dota2Module = dota2ModuleSchema.parse(loadCommonJsModule('dota2'))

const constructMessage = function constructMessage(
  messageConstructor: ProtobufMessageConstructor,
  fields: ProtobufMessageFields
): SpectateFriendGameMessage {
  return messageSchema.parse(Reflect.construct(messageConstructor, [fields]))
}

export const spectateFriendGameCodec = {
  decode: (buffer: Buffer): SpectateFriendGameResult => {
    const decoded = spectateFriendGameResultSchema.parse(
      dota2Module.schema.CMsgSpectateFriendGame.decode(buffer)
    )
    return { live: decoded.live, steamId: decoded.steam_id.toString() }
  },
  encode: ({ live, steamId }: SpectateFriendGameInput): Buffer => {
    const message = constructMessage(dota2Module.schema.CMsgSpectateFriendGame, {
      live,
      steam_id: steamId,
    })
    return message.toBuffer()
  },
}

export const spectateFriendGameResponseCodec = {
  decode: (buffer: Buffer): SpectateFriendGameResponseResult => {
    const decoded = spectateFriendGameResponseSchema.parse(
      dota2Module.schema.CMsgSpectateFriendGameResponse.decode(buffer)
    )
    return {
      serverSteamId: decoded.server_steamid.toString(),
      watchLiveResult: decoded.watch_live_result,
    }
  },
  encode: ({ serverSteamId, watchLiveResult }: SpectateFriendGameResponseInput): Buffer => {
    const message = constructMessage(dota2Module.schema.CMsgSpectateFriendGameResponse, {
      server_steamid: serverSteamId,
      watch_live_result: watchLiveResult,
    })
    return message.toBuffer()
  },
}
