import { server } from '../index.js'

export const ranks = [
  { range: [0, 153], title: 'Herald☆1', image: '11.png' },
  { range: [154, 307], title: 'Herald☆2', image: '12.png' },
  { range: [308, 461], title: 'Herald☆3', image: '13.png' },
  { range: [462, 615], title: 'Herald☆4', image: '14.png' },
  { range: [616, 769], title: 'Herald☆5', image: '15.png' },
  { range: [770, 923], title: 'Guardian☆1', image: '21.png' },
  { range: [924, 1077], title: 'Guardian☆2', image: '22.png' },
  { range: [1078, 1231], title: 'Guardian☆3', image: '23.png' },
  { range: [1232, 1385], title: 'Guardian☆4', image: '24.png' },
  { range: [1386, 1539], title: 'Guardian☆5', image: '25.png' },
  { range: [1540, 1693], title: 'Crusader☆1', image: '31.png' },
  { range: [1694, 1847], title: 'Crusader☆2', image: '32.png' },
  { range: [1848, 2001], title: 'Crusader☆3', image: '33.png' },
  { range: [2002, 2155], title: 'Crusader☆4', image: '34.png' },
  { range: [2156, 2309], title: 'Crusader☆5', image: '35.png' },
  { range: [2310, 2463], title: 'Archon☆1', image: '41.png' },
  { range: [2464, 2617], title: 'Archon☆2', image: '42.png' },
  { range: [2618, 2771], title: 'Archon☆3', image: '43.png' },
  { range: [2772, 2925], title: 'Archon☆4', image: '44.png' },
  { range: [2926, 3079], title: 'Archon☆5', image: '45.png' },
  { range: [3080, 3233], title: 'Legend☆1', image: '51.png' },
  { range: [3234, 3387], title: 'Legend☆2', image: '52.png' },
  { range: [3388, 3541], title: 'Legend☆3', image: '53.png' },
  { range: [3542, 3695], title: 'Legend☆4', image: '54.png' },
  { range: [3696, 3849], title: 'Legend☆5', image: '55.png' },
  { range: [3850, 4003], title: 'Ancient☆1', image: '61.png' },
  { range: [4004, 4157], title: 'Ancient☆2', image: '62.png' },
  { range: [4158, 4311], title: 'Ancient☆3', image: '63.png' },
  { range: [4312, 4465], title: 'Ancient☆4', image: '64.png' },
  { range: [4466, 4619], title: 'Ancient☆5', image: '65.png' },
  { range: [4620, 4819], title: 'Divine☆1', image: '71.png' },
  { range: [4820, 5019], title: 'Divine☆2', image: '72.png' },
  { range: [5020, 5219], title: 'Divine☆3', image: '73.png' },
  { range: [5220, 5419], title: 'Divine☆4', image: '74.png' },
  { range: [5420, 5629], title: 'Divine☆5', image: '75.png' },
]

export const leaderRanks = [
  { range: [1, 1], image: '92.png', sparklingEffect: true },
  { range: [2, 10], image: '91.png', sparklingEffect: true },
  { range: [11, 100], image: '80.png', sparklingEffect: true },
  { range: [101, 1000], image: '80.png', sparklingEffect: true },
  { range: [1001, 100000], image: '80.png', sparklingEffect: false },
]

export async function lookupLeaderRank(mmr: number, steam32Id?: number | null) {
  let standing = mmr

  // Not everyone has a steam32Id saved yet
  // The dota2gsi should save one for us
  if (steam32Id) {
    try {
      standing = await server.dota
        .getCard(steam32Id)
        .then((data) => data?.leaderboard_rank as number)
    } catch (e) {
      console.error('[lookupLeaderRank] Error fetching leaderboard rank', steam32Id)
      return {
        myRank: leaderRanks[leaderRanks.length - 1],
        standing: null,
        mmr,
      }
    }
  }

  if (!standing) {
    return {
      myRank: leaderRanks[leaderRanks.length - 1],
      standing: null,
      mmr,
    }
  }

  const [myRank] = leaderRanks.filter((rank) => standing <= rank.range[1])

  return { myRank, mmr, standing }
}

export async function getRankDetail(mmr: string | number, steam32Id?: number | null) {
  const mmrNum = Number(mmr)

  if (!mmrNum || mmrNum < 0) return null

  // Higher than max mmr? Lets check leaderboards
  if (mmrNum > ranks[ranks.length - 1].range[1]) {
    return lookupLeaderRank(mmrNum, steam32Id)
  }

  const [myRank, nextRank] = ranks.filter((rank) => mmrNum <= rank.range[1])

  // Its not always truthy, nextRank can be beyond the range
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const nextMMR = nextRank?.range[0] || myRank?.range[1]
  const mmrToNextRank = nextMMR - mmrNum
  const winsToNextRank = Math.ceil(mmrToNextRank / 30)

  return {
    mmr: mmrNum,
    myRank,
    nextRank,
    nextMMR,
    mmrToNextRank,
    winsToNextRank,
  }
}

// Variables: [currentmmr] [currentrank] [nextmmr] [wins]
// Used for chatting !mmr
export async function getRankDescription(
  mmr: string | number,
  customMmr: string,
  steam32Id?: number,
) {
  const deets = await getRankDetail(mmr, steam32Id)

  if (!deets) return null

  if ('standing' in deets) {
    const standingDesc = `Immortal${deets.standing ? ` #${deets.standing}` : ''}`
    return `${mmr} MMR | ${standingDesc}`
  }

  const { myRank, nextMMR, mmrToNextRank, winsToNextRank } = deets
  const nextIn = `in ${winsToNextRank} wins`
  const oneMore = mmrToNextRank <= 30 ? '| One more win peepoClap' : ''

  const msg = customMmr
    .replace('[currentmmr]', `${mmr}`)
    .replace('[currentrank]', myRank.title)
    .replace('[nextmmr]', `${nextMMR}`)
    .replace('[wins]', `${oneMore || nextIn}`)

  return msg
}
