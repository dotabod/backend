import { moderateText } from '@dotabod/profanity-filter'
import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

// Last.fm's JSON API returns track/artist/album names with HTML-encoded entities
// (e.g. "&#39;" for "'", "&amp;" for "&"). Twitch chat doesn't render HTML, so
// we decode the common entities before emitting.
const decodeHtmlEntities = (s: string): string =>
  s
    .replaceAll(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll(/&#x([0-9a-fA-F]+);/gu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

interface LastFmImage {
  size: 'small' | 'medium' | 'large' | 'extralarge'
  '#text': string
}

interface LastFmTrack {
  artist: {
    mbid: string
    '#text': string
  }
  streamable: string
  image: LastFmImage[]
  mbid: string
  album: {
    mbid: string
    '#text': string
  }
  name: string
  '@attr'?: {
    nowplaying: string
  }
  url: string
  date?: {
    uts: string
    '#text': string
  }
}

interface LastFmResponse {
  recenttracks: {
    track: LastFmTrack[]
    '@attr': {
      user: string
      totalPages: string
      page: string
      perPage: string
      total: string
    }
  }
}

commandHandler.registerCommand('song', {
  aliases: ['lastfm', 'music', 'nowplaying'],
  dbkey: DBSettings.commandLastFm,
  handler: async (message: MessageType, _args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    try {
      // Get the Last.fm username from settings
      const lastFmUsername = getValueOrDefault(
        DBSettings.lastFmUsername,
        client.settings,
        client.subscription
      )

      if (!lastFmUsername) {
        chatClient.say(
          channel,
          t('lastFmNotConfigured', { lng: client.locale }),
          message.user.messageId
        )
        return
      }

      // Call the Last.fm API to get the current song
      const apiKey = process.env.LASTFM_API_KEY
      if (!apiKey) {
        chatClient.say(channel, t('songError', { lng: client.locale }), message.user.messageId)
        return
      }

      const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${lastFmUsername}&api_key=${apiKey}&format=json&limit=1`

      const response = await fetch(url)
      const data = (await response.json()) as LastFmResponse

      if (data && 'error' in data) {
        chatClient.say(channel, t('songError', { lng: client.locale }), message.user.messageId)
        return
      }

      const tracks = data.recenttracks?.track
      if (!tracks?.length) {
        chatClient.say(channel, t('songNotPlaying', { lng: client.locale }), message.user.messageId)
        return
      }

      const recentTrack = tracks[0]
      const isNowPlaying = recentTrack['@attr']?.nowplaying === 'true'

      if (!isNowPlaying) {
        chatClient.say(channel, t('songNotPlaying', { lng: client.locale }), message.user.messageId)
        return
      }

      const [artist, title, albumText] = await Promise.all([
        moderateText(decodeHtmlEntities(recentTrack.artist['#text'] || 'Unknown')),
        moderateText(decodeHtmlEntities(recentTrack.name || 'Unknown')),
        moderateText(decodeHtmlEntities(recentTrack.album['#text'] || '')),
      ])

      // Twitch chat isn't HTML, so disable i18next's default HTML-escape —
      // otherwise the decoded apostrophes get re-encoded back to "&#39;".
      chatClient.say(
        channel,
        t('currentSong', {
          album: albumText ? ` [${albumText}]` : '',
          artist: artist || 'Unknown',
          interpolation: { escapeValue: false },
          lng: client.locale,
          title: title || 'Unknown',
          // dont show the url,
          url: '',
        }),
        message.user.messageId
      )
    } catch (error) {
      console.error('Error fetching Last.fm data:', error)
      chatClient.say(channel, t('songError', { lng: client.locale }), message.user.messageId)
    }
  },
  onlyOnline: true,
})
