import { logger, supabase } from '@dotabod/shared-utils'
import type { SocketClient } from '../../types'
import { dotabodProfileUrl } from '../../utils/index'

interface ProfileRelation {
  name: string | null
}

export async function getDotabodProfileUrl(
  client: SocketClient,
  steam32Id: number,
): Promise<string | null> {
  const belongsToStreamer =
    steam32Id === client.steam32Id ||
    client.SteamAccount.some((account) => account.steam32Id === steam32Id)

  if (belongsToStreamer) return dotabodProfileUrl(client.name)

  try {
    const { data, error } = await supabase
      .from('steam_accounts')
      .select('users(name)')
      .eq('steam32Id', steam32Id)
      .single()
    if (error) return null

    const relation = data?.users as ProfileRelation | ProfileRelation[] | null | undefined
    const profile = Array.isArray(relation) ? relation[0] : relation

    return profile?.name ? dotabodProfileUrl(profile.name) : null
  } catch (error) {
    logger.error('[PROFILE] Failed to resolve tracked Dotabod profile', { error, steam32Id })
    return null
  }
}
