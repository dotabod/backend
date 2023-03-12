import { Packet } from '../../types.js'
import { findItem } from './findItem.js'

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
  position: 1 | 2 | 3 | 4 | 5
  lane: 'bottom' | 'mid' | 'top'
}

function getDistance(
  point1: { xpos: number; ypos: number },
  point2: { xpos: number; ypos: number },
): number {
  const dx = point1.xpos - point2.xpos
  const dy = point1.ypos - point2.ypos
  return Math.sqrt(dx * dx + dy * dy)
}

// Quantity of items in inventory
export function isSupport(data: Packet): boolean {
  const supItems = ['item_ward_observer', 'item_ward_sentry', 'item_boots', 'item_ward_dispenser']

  const items = findItem(supItems, true, data)
  if (!items) return false

  const supportItems = items.filter((item) => supItems.includes(item.name))
  return supportItems.length > 0
}

// Define the window size for the moving average
const windowSize = 10

// Initialize arrays to store the last `windowSize` values for `position` and `lane`
const positionWindow: Positions[] = []
const laneWindow: Lanes[] = []

type Lanes = 'mid' | 'top' | 'bottom'
type Positions = 1 | 2 | 3 | 4 | 5

// Define a function to update the moving average
function updateMovingAverage(newResult: HeroPosition): HeroPosition {
  // Add the new value to the end of the window
  positionWindow.push(newResult.position)
  laneWindow.push(newResult.lane)

  // If the window size is exceeded, remove the oldest value from the beginning of the window
  if (positionWindow.length > windowSize) {
    positionWindow.shift()
    laneWindow.shift()
  }

  // Compute the average of the window
  const positionSum = positionWindow.reduce((sum, value) => sum + value, 0)
  const laneCounts = laneWindow.reduce<Record<Lanes, number>>((counts, lane, index) => {
    if (index === 0) {
      counts[lane] = 1
    } else {
      counts[lane] = counts[lane] ? counts[lane] + 1 : 1
    }
    return counts
    // @ts-expect-error asdf
  }, {})
  const lane = Object.entries(laneCounts).reduce(
    (mostFrequentLane, [lane, count]) =>
      // @ts-expect-error asdf
      count > laneCounts[mostFrequentLane] ? lane : mostFrequentLane,
    'mid',
  )

  const positionAverage = positionSum / positionWindow.length

  return {
    position: positionAverage as Positions,
    lane: lane as Lanes,
  }
}

export function getHeroPositions(data: Packet): HeroPosition | null {
  const xpos = data.hero?.xpos ?? 0
  const ypos = data.hero?.ypos ?? 0
  const team: 'radiant' | 'dire' = (data.player?.team_name as 'radiant' | 'dire') ?? null

  if (!team || !xpos || !ypos) return null

  const distanceTop = getDistance({ xpos, ypos }, topLaneCenter)
  const distanceBot = getDistance({ xpos, ypos }, botLaneCenter)
  const distanceMid = getDistance({ xpos, ypos }, { xpos: 0, ypos: 0 })

  const distances = [distanceBot, distanceMid, distanceTop]
  const idx: keyof (typeof laneMap)[typeof team] = distances.indexOf(
    Math.min(...distances),
  ) as keyof (typeof laneMap)[typeof team]

  const core_or_support = isSupport(data) ? 'support' : 'core'

  const result = {
    position: (laneMap[team][idx] as { [key in typeof core_or_support]: { position: number } })[
      core_or_support
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    ]?.position as Positions,
    lane: laneMap[team][idx].lane as Lanes,
  }

  return updateMovingAverage(result)
}
