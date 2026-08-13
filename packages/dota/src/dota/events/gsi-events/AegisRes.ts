export interface AegisRes {
  expireS: number
  playerId: number
  eventPlayerId?: number
  expireTime: string
  expireDate: Date
  snatched: boolean
  heroName: string | null
}
