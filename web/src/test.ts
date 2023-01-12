import axios from 'axios'

import { prisma } from './db/prisma.js'
import { server } from './dota/index.js'
import { getBotAPI } from './twitch/lib/getBotAPI.js'
import { logger } from './utils/logger.js'

async function getAccounts() {
  // const steam32id = 1234
  // const steamserverid = (await server.dota.getUserSteamServer(steam32id)) as string | undefined
  // const response = await axios(
  //   `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env.STEAM_WEB_API}&server_steam_id=${steamserverid}`,
  // )
  // logger.info(steamserverid)
}

async function getFollows() {
  const twitchApi = getBotAPI()

  const users = await prisma.user.findMany({
    select: {
      id: true,
      Account: {
        select: {
          providerAccountId: true,
        },
      },
    },
    where: {
      followers: null,
    },
  })

  for (const user of users) {
    if (!user.Account?.providerAccountId) continue
    logger.info('checking user id', { id: user.id })
    const follows = twitchApi.users.getFollowsPaginated({
      followedUser: user.Account.providerAccountId,
    })
    const totalFollowerCount = await follows.getTotalCount()
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        followers: totalFollowerCount,
      },
    })
  }
}

async function fixWins() {
  const bets = await prisma.bet.findMany({
    select: {
      id: true,
      matchId: true,
      myTeam: true,
    },
    where: {
      won: null,
    },
    skip: 0,
    take: 40,
    orderBy: {
      createdAt: 'desc',
    },
  })

  for (const bet of bets) {
    try {
      const match = await axios(
        `https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/`,
        {
          params: { key: process.env.STEAM_WEB_API, match_id: bet.matchId },
        },
      )

      if (!match.data?.result?.match_id || typeof match.data?.result?.radiant_win !== 'boolean') {
        continue
      }

      logger.info('the bet found', {
        matchId: match.data?.result?.match_id,
        lobbytype: match.data?.result?.lobby_type,
        won: match.data?.result?.radiant_win && bet.myTeam === 'radiant',
      })

      await prisma.bet.update({
        where: {
          id: bet.id,
        },
        data: {
          won: match.data?.result?.radiant_win && bet.myTeam === 'radiant',
          lobby_type: match.data?.result?.lobby_type,
        },
      })
    } catch (e) {
      continue
    }
  }
}

const topFollowers = async () => {
  const followers = await prisma.user.findMany({
    select: {
      name: true,
      followers: true,
      createdAt: true,
    },
    where: {
      stream_online: true,
    },
    orderBy: {
      followers: 'asc',
    },
    take: 10,
  })

  console.info(
    followers.map((f) => ({
      ...f,
      url: `https://twitch.tv/${f.name}`,
      followers: f.followers?.toLocaleString(),
    })),
  )
}

const getLogQuery = async (name: string) => {
  const user = await prisma.user.findFirst({
    select: {
      name: true,
      id: true,
      Account: {
        select: {
          providerAccountId: true,
        },
      },
      SteamAccount: {
        select: {
          steam32Id: true,
        },
      },
    },
    where: {
      name,
    },
  })

  if (!user) return ''

  return `
channel:${user.name} or
name:${user.name} or
${user.SteamAccount.map((a) => `steam32Id:${a.steam32Id} or`).join(' ')}
token:${user.id} or
userId:${user.id} or
user:${user.id} or
token:${user.Account?.providerAccountId ?? ''} or
message:Starting!
`
}

// console.log(await getLogQuery('grubby'))

// await updateUsernameForAll()
// await getAccounts()
// await fixWins()
// await topFollowers()

server.dota.dota2.on('ready', async () => {
  const steamserverid = (await server.dota.getUserSteamServer(849473199)) ?? ''

  console.log(
    `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env
      .STEAM_WEB_API!}&server_steam_id=${steamserverid}`,
  )

  server.dota.getGcMatchData(6965705261, (err, response) => {
    console.log('getGcMatchData', { err, response: response?.match?.match_outcome })
    //
  })

  const delayedData = await server.dota.getDelayedMatchData(steamserverid)
  console.log({ delayedData })
})

// 2 = radiant
// 3 = dire
