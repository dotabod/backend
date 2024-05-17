import type { Packet } from '../../types.js'

export function isArcade(gsi?: Packet) {
  if (!gsi) return false
  return gsi.map?.customgamename !== '' && gsi.map?.customgamename !== undefined
}
