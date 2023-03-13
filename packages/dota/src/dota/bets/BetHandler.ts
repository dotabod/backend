import { Packet } from '../../types'
import { GSIHandler } from '../GSIHandler'
import BetDatabase from './BetDatabase'

export enum ResolveCondition {
  CONTINUE,
  NEXT_CONDITION,
  REFUND,
}

export enum OpenCondition {
  OPEN,
  NOT_YET,
}

export interface Bet {
  title: string
  outcomes: string[]
  autoLockAfter: number
  openConditions: ((gameTickData: Packet) => OpenCondition)[]
  resolveConditions: ((gameTickData: Packet) => ResolveCondition | string)[]
  matchId: string
  id?: string
  resolvedOutcome?: string
  resolved?: boolean
  completedConditions: Set<number>
}

// TODO: Check that stream is online before opening bets
class TwitchBets {
  static getGsiHandler(matchid: string): GSIHandler {
    throw new Error('Method not implemented.')
  }

  private static readonly betDatabase = new BetDatabase()

  static async addBet(bet: Bet): Promise<string> {
    const { matchId } = bet
    const existingBet = await this.betDatabase.findBetByMatchId(matchId)
    if (existingBet) {
      throw new Error('A bet already exists for this match')
    }

    const betId = await this.betDatabase.createBet(bet)
    return betId
  }

  static async checkBets(gameTickData: Packet): Promise<void> {
    const bets = await this.betDatabase.findActiveBets()
    for (const bet of bets) {
      if (bet.resolved) {
        await this.betDatabase.deleteBet(bet)
        continue
      }

      for (let i = 0; i < bet.resolveConditions.length; i++) {
        if (bet.completedConditions.has(i)) {
          continue
        }

        const conditionResult = bet.resolveConditions[i](gameTickData)
        if (conditionResult === ResolveCondition.CONTINUE) {
          continue
        }

        if (conditionResult === ResolveCondition.REFUND) {
          await this.refundBet(bet)
          continue
        }

        if (conditionResult === ResolveCondition.NEXT_CONDITION) {
          bet.completedConditions.add(i)
          await this.betDatabase.updateBet(bet)
          return
        }

        if (typeof conditionResult === 'string') {
          await this.resolveBet(bet, conditionResult)
          break
        }
      }
    }
  }

  private static async refundBet(bet: Bet): Promise<void> {
    console.log(`Refunding bet ${bet.matchId}`)
    await this.betDatabase.deleteBet(bet)
  }

  private static async resolveBet(bet: Bet, outcome: string): Promise<void> {
    console.log(`Resolving bet ${bet.id!} for ${bet.title} in favor of ${outcome}`)
    await this.betDatabase.resolveBet(bet, outcome)
  }
}

export default TwitchBets
