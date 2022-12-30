import axios from 'axios'

import { prisma } from './db/prisma.js'
import { getBotAPI } from './twitch/lib/getBotAPI.js'
import { logger } from './utils/logger.js'

export async function updateUsernameForAll() {
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
      displayName: '',
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: 100,
  })

  const providerIds: string[] = users
    .map((user) => {
      if (!user.Account?.providerAccountId) return null
      return user.Account.providerAccountId
    })
    .flatMap((f) => f ?? [])

  const twitchApi = getBotAPI()
  const twitchUser = await twitchApi.users.getUsersByIds(providerIds)
  // const complete = twitchUser.map((u) => ({ name: u.name, displayName: u.displayName }))

  for (const user of twitchUser) {
    if (!user.name || !user.displayName) continue
    logger.info('updating', { name: user.name, displayName: user.displayName })
    await prisma.account.update({
      where: {
        provider_providerAccountId: {
          provider: 'twitch',
          providerAccountId: user.id,
        },
      },
      data: {
        user: {
          update: {
            displayName: user.displayName,
            name: user.name,
          },
        },
      },
    })
  }
}

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
  logger.info('fix wins')
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
    take: 20,
    orderBy: {
      createdAt: 'desc',
    },
  })

  logger.info('bets found')

  for (const bet of bets) {
    try {
      const match = await axios('https://api.opendota.com/api/matches/' + bet.matchId)
      if (!match.data?.match_id) continue

      logger.info('the bet found', {
        matchid: match.data.match_id,
        lobbytype: match.data.lobby_type,
        won: match.data.radiant_win && bet.myTeam === 'radiant',
      })

      await prisma.bet.update({
        where: {
          id: bet.id,
        },
        data: {
          won: match.data.radiant_win && bet.myTeam === 'radiant',
          lobby_type: match.data.lobby_type,
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
    },
    where: {
      stream_online: true,
    },
    orderBy: {
      followers: 'desc',
    },
    take: 30,
  })

  console.info(
    'found follower data',
    followers
      .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))
      .map((f) => ({
        ...f,
        url: `https://twitch.tv/${f.name}`,
        followers: f.followers?.toLocaleString(),
      })),
  )
}

// await updateUsernameForAll()
// await getAccounts()
// await fixWins()
await topFollowers()

// server.dota.dota2.on('ready', () => {
//   server.dota.getGcMatchData(69375017392, (err, response) => {
//     logger.info('getGcMatchData', { err, response: response?.match?.match_outcome })
//     //
//   })
// })

// 2 = radiant
// 3 = dire
