import { Packet } from '../../types.js'

export function isArcade(gsi: Packet) {
  return gsi.map?.customgamename !== '' && gsi.map?.customgamename !== undefined
}
