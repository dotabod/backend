import { faker } from '@faker-js/faker'
import { ApiClient } from '@twurple/api'
import axios from 'axios'

import { gameEnd } from '../__tests__/play-by-plays.js'
import supabase from '../db/supabase.js'
import { fetchOnlineUsers } from '../dota/events/gsi-events/__tests__/fetchOnlineUsers.js'
import { getAuthProvider } from '../twitch/lib/getAuthProvider.js'
import { getBotTokens_DEV_ONLY } from '../twitch/lib/getBotTokens.js'
import { DotaEventTypes } from '../types.js'
import { logger } from '../utils/logger.js'

if (process.env.NODE_ENV !== 'production') {
  console.log('NODE_ENV is development')
}
console.log('running dev script')

const USER_COUNT = 300

export const apiClient = axios.create({
  baseURL: 'http://localhost:5120',
})

async function postWinEventsForUsers(
  users: {
    id: string
  }[],
  win_team: 'radiant' | 'dire' = 'radiant',
) {
  const promises = users.map((user) => {
    return gameEnd({
      win_team,
      matchId: '123',
      steam32: '123',
      steam64: '123456',
      token: user.id,
    }).map((step) => {
      return apiClient.post('/', step)
    })
  })
  return await Promise.allSettled(promises)
}

export async function postEventsForUsers(
  users: {
    id: string
  }[],
  eventType: DotaEventTypes,
) {
  const promises = users.map((user) =>
    apiClient.post('/', {
      player: {
        activity: 'playing',
      },
      events: [
        {
          event_type: eventType,
          player_id: faker.number.int({ min: 0, max: 9 }),
          game_time: faker.number.int({ min: 0, max: 1_000_000 }),
        },
      ],
      auth: { token: user.id },
    }),
  )
  await Promise.allSettled(promises)
}

async function testAegis() {
  const users = await fetchOnlineUsers(USER_COUNT)
  await postWinEventsForUsers(users, 'radiant')
  await postEventsForUsers(users, DotaEventTypes.AegisPickedUp)
}

async function getBotAPI_DEV_ONLY() {
  const authProvider = getAuthProvider()
  const botTokens = await getBotTokens_DEV_ONLY()

  const twitchId = process.env.TWITCH_BOT_PROVIDERID!

  if (!botTokens?.access_token || !botTokens.refresh_token) {
    logger.info('[TWITCHSETUP] Missing bot tokens', {
      twitchId,
    })
    return false
  }

  const tokenData = {
    scope: botTokens.scope?.split(' ') ?? [],
    expiresIn: botTokens.expires_in ?? 0,
    obtainmentTimestamp: botTokens.obtainment_timestamp
      ? new Date(botTokens.obtainment_timestamp).getTime()
      : 0,
    accessToken: botTokens.access_token,
    refreshToken: botTokens.refresh_token,
  }

  authProvider.addUser(twitchId, tokenData, ['chat'])

  const api = new ApiClient({ authProvider })
  logger.info('[TWITCH] Retrieved twitch dotabod api')

  return api
}

async function fixNewUsers() {
  console.log('running fixNewUsers')
  const { data: users, error } = await supabase
    .from('users')
    .select('id, Account:accounts(providerAccountId)')
    .is('displayName', null)

  if (!users) return

  const botApi = await getBotAPI_DEV_ONLY()
  for (const user of users) {
    if (!user.Account?.providerAccountId) {
      console.log('no account for user', user.id)
      continue
    }
    if (botApi) await handleNewUser(user.Account.providerAccountId, botApi)
  }
  return
}

// await fixNewUsers()

async function handleNewUser(providerAccountId: string, botApi: ApiClient) {
  if (!botApi) return
  try {
    const stream = await botApi.streams.getStreamByUserId(providerAccountId)
    const streamer = await botApi.users.getUserById(providerAccountId)
    // const follows = botApi.users.getFollowsPaginated({
    //   followedUser: providerAccountId,
    // })
    // const totalFollowerCount = await follows.getTotalCount()

    const data = {
      displayName: streamer?.displayName,
      name: streamer?.name,
      stream_online: !!stream?.startDate,
      stream_start_date: stream?.startDate ?? null,
    }

    // remove falsy values from data (like displayName: undefined)
    const filteredData = Object.fromEntries(
      Object.entries(data).filter(([key, value]) => Boolean(value)),
    )

    let userId: string | null = null
    if (providerAccountId) {
      const { data } = await supabase
        .from('accounts')
        .select('userId')
        .eq('providerAccountId', providerAccountId)
        .single()
      userId = data?.userId ?? null
    }

    console.log({ userId, filteredData })

    if (!userId) {
      logger.error('[USER] 2 Error checking auth', { error: 'No token' })
      return null
    }

    await supabase.from('users').update(filteredData).eq('id', userId)
  } catch (e) {
    console.log(e, 'error on getStreamByUserId')
  }
}

// async function getAccounts() {
//   // const steam32id = 1234
//   // const steamserverid = (await server.dota.getUserSteamServer(steam32id)) as string | undefined
//   // const response = await axios(
//   //   `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env.STEAM_WEB_API}&server_steam_id=${steamserverid}`,
//   // )
//   // logger.info(steamserverid)
// }

// async function getFollows() {
//   if (!botApi) return
//   const users = await prisma.user.findMany({
//     select: {
//       id: true,
//       Account: {
//         select: {
//           providerAccountId: true,
//         },
//       },
//     },
//     where: {
//       followers: null,
//     },
//   })

//   for (const user of users) {
//     if (!user.Account?.providerAccountId) continue
//     logger.info('checking user id', { id: user.id })
//     const follows = botApi.users.getFollowsPaginated({
//       followedUser: user.Account.providerAccountId,
//     })
//     const totalFollowerCount = await follows.getTotalCount()
//     await prisma.user.update({
//       where: {
//         id: user.id,
//       },
//       data: {
//         followers: totalFollowerCount,
//       },
//     })
//   }
// }

// async function fixWins() {
//   const bets = await prisma.bet.findMany({
//     select: {
//       id: true,
//       matchId: true,
//       myTeam: true,
//     },
//     where: {
//       won: null,
//     },
//     skip: 0,
//     take: 40,
//     orderBy: {
//       createdAt: 'desc',
//     },
//   })

//   for (const bet of bets) {
//     try {
//       const match = await axios(
//         `https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/`,
//         {
//           params: { key: process.env.STEAM_WEB_API, match_id: bet.matchId },
//         },
//       )

//       if (!match.data?.result?.match_id || typeof match.data?.result?.radiant_win !== 'boolean') {
//         continue
//       }

//       logger.info('the bet found', {
//         matchId: match.data?.result?.match_id,
//         lobbytype: match.data?.result?.lobby_type,
//         won: match.data?.result?.radiant_win && bet.myTeam === 'radiant',
//       })

//       await prisma.bet.update({
//         where: {
//           id: bet.id,
//         },
//         data: {
//           won: match.data?.result?.radiant_win && bet.myTeam === 'radiant',
//           lobby_type: match.data?.result?.lobby_type,
//         },
//       })
//     } catch (e) {
//       continue
//     }
//   }
// }

// const topFollowers = async () => {
//   const followers = await prisma.user.findMany({
//     select: {
//       name: true,
//       followers: true,
//       createdAt: true,
//     },
//     where: {
//       stream_online: true,
//     },
//     orderBy: {
//       followers: 'desc',
//     },
//     take: 10,
//   })

//   console.info(
//     followers.map((f) => ({
//       ...f,
//       url: `https://twitch.tv/${f.name}`,
//       followers: f.followers?.toLocaleString(),
//     })),
//   )
// }

// console.log(await getLogQuery('gorgc'))

// /*
// server.dota.dota2.on('ready', async () => {
//   const steamserverid = (await server.dota.getUserSteamServer(849473199)) ?? ''

//   console.log(
//     `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env
//       .STEAM_WEB_API!}&server_steam_id=${steamserverid}`,
//   )

//   server.dota.getGcMatchData(6965705261, (err, response) => {
//     console.log('getGcMatchData', { err, response: response?.match?.match_outcome })
//     //
//   })

//   const delayedData = await server.dota.getDelayedMatchData({steamserverid})
//   console.log({ delayedData })
// })*/

// // 2 = radiant
// // 3 = dire

// async function onlineEvent({ userId, startDate }: { userId: string; startDate: Date }) {
//   return await prisma.user.update({
//     data: {
//       stream_online: true,
//       stream_start_date: startDate.toISOString(),
//     },
//     where: {
//       id: userId,
//     },
//   })
// }
// async function checkUserOnline({
//   providerAccountId,
//   userId,
// }: {
//   providerAccountId: string
//   userId: string
// }) {
//   if (!botApi) return

//   console.log('checking', { providerAccountId, userId })
//   if (!providerAccountId) return

//   try {
//     const stream = await botApi.streams.getStreamByUserId(providerAccountId)
//     console.log({ stream })
//     if (stream?.startDate) {
//       await onlineEvent({
//         startDate: stream.startDate,
//         userId,
//       })
//     }
//   } catch (e) {
//     console.log(e, 'error on checkUserOnline')
//   }
// }

// async function fixOnline() {
//   const bets = await prisma.bet.findMany({
//     where: {
//       user: {
//         stream_online: {
//           not: true,
//         },
//       },
//       createdAt: {
//         gte: new Date('2023-01-13T09:46:51.887Z'),
//       },
//     },
//     select: {
//       id: true,
//       user: {
//         select: {
//           id: true,
//           Account: {
//             select: {
//               providerAccountId: true,
//             },
//           },
//         },
//       },
//     },
//     distinct: ['userId'],
//   })

//   for (const bet of bets) {
//     await checkUserOnline({
//       providerAccountId: bet.user.Account?.providerAccountId ?? '',
//       userId: bet.user.id,
//     })
//   }
// }

// const newLocales = [
//   'en',
//   'af-ZA',
//   'ar-SA',
//   'ca-ES',
//   'cs-CZ',
//   'da-DK',
//   'de-DE',
//   'el-GR',
//   'es-ES',
//   'fa-IR',
//   'fi-FI',
//   'fr-FR',
//   'he-IL',
//   'hu-HU',
//   'it-IT',
//   'ja-JP',
//   'ko-KR',
//   'nl-NL',
//   'no-NO',
//   'pl-PL',
//   'pt-BR',
//   'pt-PT',
//   'ro-RO',
//   'ru-RU',
//   'sr-SP',
//   'sv-SE',
//   'tr-TR',
//   'uk-UA',
//   'vi-VN',
//   'zh-CN',
//   'zh-TW',
// ]
// function mapLocale(locale: string) {
//   if (locale.length === 2) {
//     return newLocales.find((l) => l.startsWith(locale)) ?? 'en'
//   }

//   return locale
// }

// // function to migrate users from old locale 2 letter code to new locale hyphenated string
// async function migrateUsersToNewLocale() {
//   const users = await prisma.user.findMany({
//     where: {
//       locale: {
//         not: PrismaClient.dbNull,
//       },
//     },
//     select: {
//       id: true,
//       locale: true,
//     },
//   })

//   const data = users.map((user) => ({
//     id: user.id,
//     locale: mapLocale(user.locale),
//   }))

//   // group by locale
//   const grouped = data.reduce<Record<string, string[]>>((acc, user) => {
//     if (!acc[user.locale]) {
//       acc[user.locale] = []
//     }

//     acc[user.locale].push(user.id)

//     return acc
//   }, {})

//   try {
//     for (const locale of Object.keys(grouped)) {
//       await prisma.user.updateMany({
//         data: {
//           locale: locale,
//         },
//         where: {
//           id: {
//             in: grouped[locale],
//           },
//         },
//       })
//     }
//   } catch (e) {
//     console.log(e)
//   }
// }

// async function migrateUsersToNewMMROptions() {
//   const disabledMmrUsers =
//     (await prisma.$queryRaw`SELECT * FROM settings WHERE value is null`) as []
//   /*  const disabledMmrUsers = await prisma.setting.findMany({
//     where: {
//       key: 'mmr-tracker',
//       value: PrismaClient.dbNull,
//     },
//     select: {
//       value: true,
//       user: {
//         select: {
//           id: true,
//         },
//       },
//     },
//   })*/

//   const data = []
//   const keys = ['showRankMmr', 'showRankImage', 'showRankLeader']
//   // turn these off
//   for (const setting of disabledMmrUsers as any) {
//     data.push(keys.map((key) => ({ key, value: false, userId: setting.userId })))
//   }

//   console.log(disabledMmrUsers)
//   /* await prisma.setting.createMany({
//     data: data.flat(),
//     skipDuplicates: true,
//   })*/
// }
