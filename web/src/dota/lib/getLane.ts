import { Hero, Packet } from '../../types.js'

const topLaneCenter = { xpos: -6000, ypos: 5000 }
const botLaneCenter = { xpos: 6000, ypos: -5000 }
const laneMap = {
  radiant: {
    1: 'top',
    2: 'mid',
    3: 'bottom',
    4: 'top',
    5: 'bottom',
  },
  dire: {
    1: 'bottom',
    2: 'mid',
    3: 'top',
    4: 'bottom',
    5: 'top',
  },
}

interface HeroPosition {
  position: number
  lane: string
}

function getDistance(
  point1: { xpos: number; ypos: number },
  point2: { xpos: number; ypos: number },
): number {
  const dx = point1.xpos - point2.xpos
  const dy = point1.ypos - point2.ypos
  return Math.sqrt(dx * dx + dy * dy)
}

export function getHeroPositions(data: Packet): HeroPosition {
  const xpos = data.hero?.xpos ?? 0
  const ypos = data.hero?.ypos ?? 0
  const team = data.player?.team_name as undefined | 'radiant' | 'dire'

  if (!team || !xpos || !ypos) return { position: 0, lane: 'unknown' }

  const isRadiant = team === 'radiant'

  const cs = data.player?.last_hits ?? 0
  const minute = (data.map?.clock_time ?? 0) / 60
  const csPerMinute = cs / minute

  let isCore = false

  // TODO: This number needs to be determined better somehow.
  const isCoreThreshold = 4

  if (csPerMinute > isCoreThreshold) {
    isCore = true
  }

  const distanceTop = getDistance({ xpos, ypos }, topLaneCenter)
  const distanceBot = getDistance({ xpos, ypos }, botLaneCenter)
  const distanceMid = getDistance({ xpos, ypos }, { xpos: 0, ypos: 0 })

  const isMidLane = distanceMid < distanceTop && distanceMid < distanceBot
  const isCloserToTop = distanceTop < distanceBot

  const pos1 = isRadiant ? (isCore ? 1 : 5) : isCore ? 3 : 4
  const pos2 = isRadiant ? (isCore ? 3 : 4) : isCore ? 1 : 5

  const pos = !isCloserToTop ? pos2 : pos1

  if (isMidLane) {
    return { position: 2, lane: laneMap[team][2] }
  }

  return {
    position: pos,
    lane: laneMap[team][pos],
  }
}
