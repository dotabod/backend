import type { Packet } from '../../types'

export function isArcade(gsi?: Packet) {
  if (!gsi) return false
  return gsi.map?.customgamename !== '' && gsi.map?.customgamename !== undefined
}
