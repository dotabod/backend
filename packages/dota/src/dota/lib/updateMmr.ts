import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { MULTIPLIER_PARTY, MULTIPLIER_SOLO } from '../../db/getWL'
import { DBSettings, getValueOrDefault } from '../../settings'
import { chatClient } from '../../twitch/chatClient'
import findUser from './connectedStreamers'
import { GLOBAL_DELAY } from './consts'

interface TellChatNewMMRParams {
  locale: string
  token: string
  mmr?: number
  oldMmr?: number
  streamDelay: number
}

function tellChatNewMMR({ streamDelay, locale, token, mmr = 0, oldMmr = 0 }: TellChatNewMMRParams) {
  const client = findUser(token)
  if (!client) {
    return
  }

  const mmrEnabled = getValueOrDefault(
    DBSettings['mmr-tracker'],
    client.settings,
    client.subscription
  )
  const tellChatNewMMR = getValueOrDefault(
    DBSettings.tellChatNewMMR,
    client.settings,
    client.subscription
  )
  const chattersEnabled = getValueOrDefault(
    DBSettings.chatter,
    client.settings,
    client.subscription
  )

  const newMmr = mmr - oldMmr
  if (mmrEnabled && chattersEnabled && tellChatNewMMR && mmr !== 0) {
    if (newMmr === 0) {
      chatClient.say(client.name, t('updateMmrNoChange', { lng: locale, mmr }))
    } else {
      const isAuto = [MULTIPLIER_PARTY, MULTIPLIER_SOLO].includes(Math.abs(newMmr))
      setTimeout(
        () => {
          chatClient.say(
            client.name,
            t('updateMmr', {
              context: isAuto ? 'auto' : 'manual',
              delta: `${newMmr > 0 ? '+' : ''}${newMmr}`,
              lng: locale,
              mmr,
            })
          )
        },
        isAuto ? streamDelay + GLOBAL_DELAY : 0
      )
    }
  }
}

export interface UpdateMmrParams {
  tellChat?: boolean
  newMmr: string | number
  steam32Id: number | null | undefined
  channel: string
  currentMmr: number
  token?: string | null
  force?: boolean
}

export async function updateMmr({
  tellChat = false,
  force = false,
  currentMmr,
  newMmr,
  steam32Id,
  channel,
  token,
}: UpdateMmrParams) {
  // uncalibrated (0) mmr do not deserve an update
  if (!currentMmr && !force) {
    return
  }

  let mmr = Number(newMmr)
  if (!newMmr || !mmr || mmr > 20_000 || mmr < 0) {
    logger.info('Invalid mmr, forcing to 0', { channel, mmr })
    mmr = 0
  }

  if (!steam32Id) {
    if (!token) {
      logger.info('[UPDATE MMR] No token id provided, will not update user table', { channel })
      return
    }

    logger.info(
      '[UPDATE MMR] No steam32Id provided, will update the users table until they get one',
      {
        channel,
      }
    )

    await supabase
      .from('users')
      .update({
        mmr, // New MMR value
        updated_at: new Date().toISOString(),
      })
      .eq('id', token)

    const client = findUser(token)
    if (client) {
      client.mmr = mmr
      if (tellChat) {
        tellChatNewMMR({
          locale: client.locale,
          mmr,
          oldMmr: currentMmr,
          streamDelay: getValueOrDefault(
            DBSettings.streamDelay,
            client.settings,
            client.subscription
          ),
          token: client.token,
        })
      }
    }

    return
  }

  const data = await supabase
    .from('steam_accounts')
    .update({
      mmr,
      updated_at: new Date().toISOString(),
    })
    .eq('steam32Id', steam32Id)
    .select('userId')

  const foundToken = data.data?.[0]?.userId
  if (!foundToken) {
    logger.info('[UPDATE MMR] No token found, will not update user table', { channel })
    return
  }

  await supabase
    .from('users')
    .update({
      mmr: 0, // New MMR value
      updated_at: new Date().toISOString(),
    })
    .eq('id', foundToken)

  const client = findUser(foundToken)

  if (client) {
    // Keep the in-memory client in sync immediately, same as the !steam32Id
    // branch above — otherwise the next updateMmr() call (e.g. a second !won
    // typed seconds later) reads this stale value until the Supabase
    // realtime `steam_accounts` watcher round-trips and overwrites it,
    // silently clobbering whichever update loses the race.
    const steamIdx = client.SteamAccount.findIndex((s) => s.steam32Id === steam32Id)
    if (steamIdx !== -1) {
      client.SteamAccount[steamIdx].mmr = mmr
    }
    if (client.steam32Id === steam32Id) {
      client.mmr = mmr
    }

    if (tellChat) {
      tellChatNewMMR({
        locale: client.locale,
        mmr,
        oldMmr: currentMmr,
        streamDelay: getValueOrDefault(
          DBSettings.streamDelay,
          client.settings,
          client.subscription
        ),
        token: client.token,
      })
    }
  }
}
