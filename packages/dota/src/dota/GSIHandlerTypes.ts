import type { MatchMinimalDetailsResponse, SocketClient } from '../types.js'
import type { DataBroadcasterInterface } from './events/minimap/DataBroadcasterTypes.js'

// Type definition for GSIHandler that can be used without importing the actual class
export interface GSIHandlerType {
  closeBets: (
    team: 'radiant' | 'dire' | null,
    gcData?: MatchMinimalDetailsResponse,
  ) => Promise<void>
  openBets: (client: SocketClient) => Promise<void>
  emitNotablePlayers: () => Promise<void>
  emitBadgeUpdate: () => void
  updateSteam32Id: () => Promise<void>
  setupOBSBlockers: (gameState: string) => Promise<void>
  emitWLUpdate: () => void
  client: SocketClient
  blockCache: string | null
  events: any[]
  bountyHeroNames: string[]
  noTpChatter: {
    timeout?: NodeJS.Timeout
    lastRemindedDate?: Date
  }
  bountyTimeout?: NodeJS.Timeout
  killstreakTimeout?: NodeJS.Timeout
  endingBets: boolean
  openingBets: boolean
  creatingSteamAccount: boolean
  checkingEarlyDCWinner: boolean
  treadsData: { treadToggles: number; manaSaved: number; manaAtLastToggle: number }
  disabled: boolean

  // Use generic Record type instead of concrete implementations
  mapBlocker: DataBroadcasterInterface
  neutralItemTimer: Record<string, any>

  enable(): void
  disable(): void
  getMmr(): number
  getToken(): string
  getSteam32(): number | null
  getChannelId(): string
  addSecondsToNow(seconds: number): Date
  resetClientState(): Promise<void>
}
