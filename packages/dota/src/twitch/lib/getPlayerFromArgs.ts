import { t } from 'i18next'

import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { getHeroById, getHeroByName, heroColors } from '../../dota/lib/heroes.js'
import { Packet } from '../../types.js'
import CustomError from '../../utils/customError.js'

export async function getPlayerFromArgs({
  args,
  locale,
  packet,
  command,
}: {
  packet?: Packet
  args: string[]
  locale: string
  command: string
}) {
  const { matchPlayers: players } = await getAccountsFromMatch({ gsi: packet })
  const heroIdsInMatch = players.map((player) => player.heroid)
  const heroList = heroIdsInMatch
    .map((heroId) => getHeroById(heroId))
    .map((hero) => hero?.alias?.[0] ?? hero?.localized_name)
    .join(' · ')

  if (!args.length) {
    if (heroIdsInMatch.length > 1) {
      throw new CustomError(t('invalidHero', { command, heroList, lng: locale }))
    }

    throw new CustomError(
      t('invalidColorNew', { command, colorList: heroColors.join(' · '), lng: locale }),
    )
  }

  // herokey is 0-9
  let playerIdx: number | undefined

  const firstArg = args[0].toLowerCase().trim()
  const heroColorIndex = heroColors.findIndex((heroColor) => heroColor.toLowerCase() === firstArg)

  // 1-10 input
  const slotRequest = Number(firstArg)
  if (slotRequest && slotRequest >= 1 && slotRequest <= 10) {
    playerIdx = slotRequest - 1
  } else if (heroColorIndex !== -1) {
    // color input
    playerIdx = heroColorIndex
  } else {
    // hero name input or alias
    const hero = getHeroByName(args.join('').toLowerCase().trim(), heroIdsInMatch)
    playerIdx = hero ? players.findIndex((player) => player.heroid === hero.id) : -1
  }

  if (playerIdx < 0 || playerIdx > 9) {
    if (heroIdsInMatch.length > 1) {
      throw new CustomError(t('invalidHero', { command, heroList, lng: locale }))
    }

    throw new CustomError(
      t('invalidColorNew', { command, colorList: heroColors.join(' · '), lng: locale }),
    )
  }

  return { playerIdx, player: players[playerIdx] }
}
