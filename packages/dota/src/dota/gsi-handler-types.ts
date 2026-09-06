import type { BlockType, DotaEvent, MatchClosingDetailsResponse, SocketClient } from '../types'
import type { DataBroadcasterInterface } from './events/minimap/data-broadcaster-types'

interface NeutralItemTimerInterface {
  checkNeutralItems: () => Promise<void>
  reset: () => void
}

// Type definition for GSIHandler that can be used without importing the actual class
export interface GSIHandlerType {
  closeBets: (
    team: 'radiant' | 'dire' | null,
    gcData?: MatchClosingDetailsResponse
  ) => Promise<void>
  openBets: (client: SocketClient) => Promise<void>
  openTheBet: (matchId: string, heroName: string, myTeam?: string) => Promise<void>
  emitNotablePlayers: () => Promise<void>
  emitStreamersInMatch: () => Promise<void>
  emitBadgeUpdate: () => void
  updateSteam32Id: () => Promise<void>
  setupOBSBlockers: (gameState: string) => Promise<void>
  emitWLUpdate: (allowOffline?: boolean) => void
  client: SocketClient
  blockCache: BlockType | undefined
  events: DotaEvent[]
  bountyHeroNames: string[]
  noTpChatter: {
    taskId?: string
    lastRemindedDate?: Date
  }
  bountyTaskId?: string
  killstreakTaskId?: string
  endingBets: boolean
  openingBets: boolean
  creatingSteamAccount: boolean
  checkingEarlyDCWinner: boolean
  multiAccountRevalidatedAt?: number
  treadsData: { treadToggles: number; manaSaved: number; manaAtLastToggle: number }
  disabled: boolean

  mapBlocker: DataBroadcasterInterface
  neutralItemTimer: NeutralItemTimerInterface

  enable: () => void
  disable: () => void
  getMmr: () => number
  getToken: () => string
  getSteam32: () => number | null
  getChannelId: () => string
  addSecondsToNow: (seconds: number) => Date
  resetClientState: () => Promise<void>
}
