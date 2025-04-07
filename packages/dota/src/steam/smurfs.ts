import { t } from 'i18next'

import { getPlayers } from '../dota/lib/getPlayers.js'
import { getHeroNameOrColor } from '../dota/lib/heroes.js'
import type { Players } from '../types.js'

export async function smurfs(
  locale: string,
  currentMatchId?: string,
  players?: Players,
): Promise<string> {
  const { matchPlayers, cards } = await getPlayers({ locale, currentMatchId, players })

  const result: { heroName: string; lifetime_games?: number }[] = []
  matchPlayers.forEach((player, i: number) => {
    result.push({
      heroName: getHeroNameOrColor(player.heroid || 0, i),
      lifetime_games: cards[i]?.lifetime_games,
    })
  })
  const results = result
    .sort((a, b) => (a.lifetime_games ?? 0) - (b.lifetime_games ?? 0))
    .map((m) =>
      typeof m.lifetime_games === 'number' && m.lifetime_games > 0
        ? `${m.heroName}: ${m.lifetime_games.toLocaleString()}`
        : undefined,
    )
    .filter(Boolean)
    .join(' · ')
  return `${t('lifetime', { lng: locale })}: ${results || t('unknown', { lng: locale })}`
}
