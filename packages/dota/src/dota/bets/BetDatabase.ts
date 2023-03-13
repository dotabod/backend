import { Bet } from './BetHandler'

class BetDatabase {
  private readonly database: any // replace with actual database client

  // eslint-disable-next-line @typescript-eslint/require-await
  async findBetByMatchId(matchId: string): Promise<Bet | null> {
    // implement database query to find a bet by matchId
    return null
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findActiveBets(): Promise<Bet[]> {
    // implement database query to find all active bets
    return []
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async createBet(bet: Bet): Promise<string> {
    // implement database query to create a new bet and return its ID
    return '1234'
  }

  async updateBet(bet: Bet): Promise<void> {
    // implement database query to update an existing bet
  }

  async deleteBet(bet: Bet): Promise<void> {
    // implement database query to delete a bet
  }

  async resolveBet(bet: Bet, outcome: string): Promise<void> {
    // implement database query to resolve a bet with the given outcome
  }
}

export default BetDatabase
