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
  { range: [5420, 5760], title: 'Divine☆5', image: '75.png' },
  { range: [5761, 20000], title: 'Immortal', image: '80.png' },
]

export function getRankDetail(param: any) {
  const mmr = Number(param)

  if (mmr < 0) return null

  // Max mmr just returning highest rank idk
  // if (mmr > ranks[ranks.length - 1].range[1]) return { myRank: { title: 'Immortal' } }

  const [myRank, nextRank] = ranks.filter((rank) => mmr <= rank.range[1])

  const nextMMR = nextRank?.range[0] || myRank?.range[1]
  const mmrToNextRank = nextMMR - mmr
  const winsToNextRank = Math.ceil(mmrToNextRank / 30)

  return {
    myRank,
    nextRank,
    nextMMR,
    mmrToNextRank,
    winsToNextRank,
  }
}

export function getRankDescription(param: any) {
  const deets = getRankDetail(param)

  if (!deets) return 'Unknown'

  const { myRank, nextMMR, mmrToNextRank, winsToNextRank } = deets
  const nextAt = ` | Next rank at ${nextMMR}`
  const nextIn = ` in ${winsToNextRank} wins`
  const oneMore = mmrToNextRank <= 30 ? ' | One more win peepoClap' : ''

  return `${param} | ${myRank?.title}${nextAt}${oneMore || nextIn}`
}

export function getRankImage(mmr: any) {
  const rank = getRankDetail(mmr)

  if (!rank) return '0.png'

  return rank.myRank?.image
}
