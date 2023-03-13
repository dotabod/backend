import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { Packet } from '../../../types'
import { logger } from '../../../utils/logger'
import TwitchBets, { Bet, OpenCondition, ResolveCondition } from '../BetHandler'

// Example usage
const bet: Bet = {
  title: 'Will we win with [heroname]?',
  outcomes: ['Yes', 'No'],
  autoLockAfter: 240,
  completedConditions: new Set(),
  openConditions: [
    (gameTickData: Packet) => {
      // Why open if not playing?
      if (gameTickData.player?.activity !== 'playing') {
        return OpenCondition.NOT_YET
      }

      // Why open if won?
      if (gameTickData.map?.win_team !== 'none') {
        return OpenCondition.NOT_YET
      }

      // We at least want the hero name so it can go in the twitch bet title
      if (!gameTickData.hero?.name || !gameTickData.hero.name.length) {
        return OpenCondition.NOT_YET
      }

      // It's not a live game, so we don't want to open bets nor save it to DB
      if (!gameTickData.map.matchid || gameTickData.map.matchid === '0') {
        return OpenCondition.NOT_YET
      }

      // We have everything we need, so we can open the bet
      return OpenCondition.OPEN
    },
  ],
  resolveConditions: [
    (gameTickData: Packet) => {
      if (gameTickData.map?.win_team === 'none' || !gameTickData.map?.win_team) {
        return ResolveCondition.CONTINUE
      }

      const winningTeam = gameTickData.map.win_team
      const myTeam = gameTickData.player?.team_name
      const scores = {
        kda: {
          kills: gameTickData.player?.kills ?? null,
          deaths: gameTickData.player?.deaths ?? null,
          assists: gameTickData.player?.assists ?? null,
        },
        radiant_score: gameTickData.map.radiant_score ?? null,
        dire_score: gameTickData.map.dire_score ?? null,
      }
      const won = myTeam === winningTeam

      if (
        !gameTickData.map.dire_score &&
        !gameTickData.map.radiant_score &&
        gameTickData.map.matchid
      ) {
        logger.info('This is likely a no stats recorded match', {})

        const gsiHandler = TwitchBets.getGsiHandler(gameTickData.map.matchid)
        const tellChatBets = getValueOrDefault(DBSettings.tellChatBets, gsiHandler.client.settings)
        const chattersEnabled = getValueOrDefault(DBSettings.chatter, gsiHandler.client.settings)
        if (chattersEnabled && tellChatBets) {
          gsiHandler.say(
            t('bets.notScored', {
              emote: 'D:',
              lng: gsiHandler.client.locale,
              matchId: gameTickData.map.matchid,
            }),
          )
        }

        gsiHandler.resetClientState()
        return ResolveCondition.REFUND
      }

      return ResolveCondition.CONTINUE
    },
  ],
  matchId: 'match-123',
}

const betId = await TwitchBets.addBet(bet)
console.log(`Created bet with id ${betId}`)
