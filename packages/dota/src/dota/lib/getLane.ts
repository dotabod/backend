import { Packet } from '../../types.js'

const topLaneCenter = { xpos: -6000, ypos: 5000 }
const botLaneCenter = { xpos: 6000, ypos: -5000 }
const laneMap = {
  radiant: {
    0: {
      core: {
        position: 1,
      },
      support: {
        position: 5,
      },
      lane: 'bottom',
    },
    1: {
      core: {
        position: 2,
      },
      lane: 'mid',
    },
    2: {
      core: {
        position: 3,
      },
      support: {
        position: 4,
      },
      lane: 'top',
    },
  },
  dire: {
    0: {
      core: {
        position: 3,
      },
      support: {
        position: 4,
      },
      lane: 'bottom',
    },
    1: {
      core: {
        position: 2,
      },
      lane: 'mid',
    },
    2: {
      core: {
        position: 1,
      },
      support: {
        position: 5,
      },
      lane: 'top',
    },
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
  const team: 'radiant' | 'dire' = (data.player?.team_name as 'radiant' | 'dire') ?? 'unknown'

  if (!team || !xpos || !ypos) return { position: 0, lane: 'unknown' }

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

  const distances = [distanceBot, distanceMid, distanceTop]
  const idx: keyof (typeof laneMap)[typeof team] = distances.indexOf(
    Math.min(...distances),
  ) as keyof (typeof laneMap)[typeof team]

  let core_or_support: 'core' | 'support'
  if (csPerMinute > isCoreThreshold) {
    core_or_support = 'core'
  } else {
    core_or_support = 'support'
  }

  const result = {
    position: (laneMap[team][idx] as { [key in typeof core_or_support]: { position: number } })[
      core_or_support
    ].position,
    lane: laneMap[team][idx].lane,
  }

  console.log({ result, team, distances, idx, csPerMinute, isCore, isCoreThreshold })

  return result
}
