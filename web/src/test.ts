import axios from 'axios'

import { prisma } from './db/prisma.js'

const bets = await prisma.bet.findMany({
  select: {
    id: true,
    matchId: true,
    myTeam: true,
  },
  skip: 10,
  take: 10,
  orderBy: {
    createdAt: 'desc',
  },
})

for (const bet of bets) {
  try {
    const match = await axios('https://api.opendota.com/api/matches/' + bet.matchId)
    if (!match.data?.match_id) continue

    console.log({
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
