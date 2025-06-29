import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { MULTIPLIER_PARTY, MULTIPLIER_SOLO } from '../../db/getWL.js'
import { DBSettings, getValueOrDefault } from '../../settings.js'
import { chatClient } from '../../twitch/chatClient.js'
import findUser from './connectedStreamers.js'
import { GLOBAL_DELAY } from './consts.js'

interface TellChatNewMMRParams {
  locale: string
  token: string
  mmr?: number
  oldMmr?: number
  streamDelay: number
}

export function tellChatNewMMR({
  streamDelay,
  locale,
  token,
  mmr = 0,
  oldMmr = 0,
}: TellChatNewMMRParams) {
  const client = findUser(token)
  if (!client) return

  const mmrEnabled = getValueOrDefault(
    DBSettings['mmr-tracker'],
    client.settings,
    client.subscription,
  )
  const tellChatNewMMR = getValueOrDefault(
    DBSettings.tellChatNewMMR,
    client.settings,
    client.subscription,
  )
  const chattersEnabled = getValueOrDefault(
    DBSettings.chatter,
    client.settings,
    client.subscription,
  )

  const newMmr = mmr - oldMmr
  if (mmrEnabled && chattersEnabled && tellChatNewMMR && mmr !== 0) {
    if (newMmr !== 0) {
      const isAuto = [MULTIPLIER_PARTY, MULTIPLIER_SOLO].includes(Math.abs(newMmr))
      setTimeout(
        () => {
          chatClient.say(
            client.name,
            t('updateMmr', {
              context: isAuto ? 'auto' : 'manual',
              mmr,
              delta: `${newMmr > 0 ? '+' : ''}${newMmr}`,
              lng: locale,
            }),
          )
        },
        isAuto ? streamDelay + GLOBAL_DELAY : 0,
      )
    } else {
      chatClient.say(client.name, t('updateMmrNoChange', { mmr, lng: locale }))
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
  if (!currentMmr && !force) return

  let mmr = Number(newMmr)
  if (!newMmr || !mmr || mmr > 20000 || mmr < 0) {
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
      },
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
          streamDelay: getValueOrDefault(
            DBSettings.streamDelay,
            client.settings,
            client.subscription,
          ),
          locale: client.locale,
          token: client.token,
          mmr,
          oldMmr: currentMmr,
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

  if (client && tellChat) {
    tellChatNewMMR({
      streamDelay: getValueOrDefault(DBSettings.streamDelay, client.settings, client.subscription),
      locale: client.locale,
      token: client.token,
      mmr,
      oldMmr: currentMmr,
    })
  }
}
