import { t } from 'i18next'

import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler';
import type { MessageType } from '../lib/CommandHandler';

const contributors = [
  { contributors: ['@techleed'], language: 'English', locale: 'en' },
  { contributors: ['MorTal', 'nikkkolai', 'azverin7'], language: 'Russian', locale: 'ru-RU' },
  { contributors: ['OmniXen', '@helle_xxx'], language: 'Italian', locale: 'it-IT' },
  { contributors: ['BDN', 'chefinhu'], language: 'Portuguese', locale: 'pt-PT' },
  { contributors: ['KenjiMomose', '! Eldo'], language: 'Brazilian Portuguese', locale: 'pt-BR' },
  { contributors: ['@SirShirou'], language: 'Spanish', locale: 'es-ES' },
  { contributors: ['@slinkyone', 'ggeeli'], language: 'Hungarian', locale: 'hu-HU' },
  { contributors: ['matt100893', 'Poody'], language: 'Czech', locale: 'cs-CZ' },
  { contributors: ['@dankYbat'], language: 'Ukrainian', locale: 'uk-UA' },
  { contributors: ['@RSaber'], language: 'Farsi', locale: 'fa-IR' },
  { contributors: ['Bedirhan'], language: 'Turkish', locale: 'tr-TR' },
  { contributors: ['Ostfreeze'], language: 'German', locale: 'de-DE' },
  { contributors: ['@poecco'], language: 'Swedish', locale: 'sv-SE' },
  { contributors: ['@poecco'], language: 'Finnish', locale: 'fi-FI' },
  { contributors: ['PoliG^', '@ProximusPL'], language: 'Polish', locale: 'pl-PL' },
]

commandHandler.registerCommand('locale', {
  aliases: ['translation', 'translatedby'],
  handler: (message: MessageType, _args: string[]) => {
    const translators = contributors.find((c) => c.locale === message.channel.client.locale)
    if (!translators) {
      chatClient.say(
        message.channel.name,
        t('translated.by', {
          lng: message.channel.client.locale,
          count: 0,
          url: 'crowdin.com/project/dotabod',
        }),
        message.user.messageId
      )
      return
    }

    chatClient.say(
      message.channel.name,
      t('translated.by', {
        count: translators.contributors.length,
        lng: message.channel.client.locale,
        translators: translators.contributors.join(' · '),
        url: 'crowdin.com/project/dotabod',
      }),
      message.user.messageId
    )
  },
  permission: 0,
})
