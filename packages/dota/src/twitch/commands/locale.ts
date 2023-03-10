import { t } from 'i18next'

import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

const contributors = [
  { language: 'English', locale: 'en', contributors: ['techleed'] },
  { language: 'Russian', locale: 'ru-RU', contributors: ['MorTal', 'nikkkolai', 'azverin7'] },
  { language: 'Italian', locale: 'it-IT', contributors: ['OmniXen', '@helle_xxx'] },
  { language: 'Portuguese', locale: 'pt-PT', contributors: ['BDN', 'chefinhu'] },
  { language: 'Brazilian Portuguese', locale: 'pt-BR', contributors: ['KenjiMomose', '! Eldo'] },
  { language: 'Spanish', locale: 'es-ES', contributors: ['@SirShirou'] },
  { language: 'Hungarian', locale: 'hu-HU', contributors: ['@slinkyone', 'ggeeli'] },
  { language: 'Czech', locale: 'cs-CZ', contributors: ['matt100893', 'Poody'] },
  { language: 'Ukrainian', locale: 'uk-UA', contributors: ['@dankYbat'] },
  { language: 'Farsi', locale: 'fa-IR', contributors: ['@RSaber'] },
  { language: 'Turkish', locale: 'tr-TR', contributors: ['Bedirhan'] },
  { language: 'German', locale: 'de-DE', contributors: ['Ostfreeze'] },
  { language: 'Swedish', locale: 'sv-SE', contributors: ['@poecco'] },
  { language: 'Finnish', locale: 'fi-FI', contributors: ['@poecco'] },
  { language: 'Polish', locale: 'pl-PL', contributors: ['PoliG^', '@ProximusPL'] },
]

commandHandler.registerCommand('locale', {
  aliases: ['lang', 'language', 'translation', 'translate', 'translated'],
  permission: 0,
  cooldown: 0,
  handler: (message: MessageType, args: string[]) => {
    const translators = contributors.find((c) => c.locale === message.channel.client.locale)
    if (!translators) {
      chatClient.say(
        message.channel.name,
        t('translated.by', {
          lng: message.channel.client.locale,
          count: 0,
          url: 'https://discord.dotabod.com',
        }),
      )
      return
    }

    chatClient.say(
      message.channel.name,
      t('translated.by', {
        count: translators.contributors.length,
        lng: message.channel.client.locale,
        translators: translators.contributors.join(' · '),
        url: 'https://discord.dotabod.com',
      }),
    )
  },
})
