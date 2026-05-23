import { moderateText } from '@dotabod/profanity-filter'
import { t } from 'i18next'
import { DBSettings, getValueOrDefault } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'

// Last.fm's JSON API returns track/artist/album names with HTML-encoded entities
// (e.g. "&#39;" for "'", "&amp;" for "&"). Twitch chat doesn't render HTML, so
// we decode the common entities before emitting.
const decodeHtmlEntities = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

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
  onlyOnline: true,
  dbkey: DBSettings.commandLastFm,
  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    try {
      // Get the Last.fm username from settings
      const lastFmUsername = getValueOrDefault(
        DBSettings.lastFmUsername,
        client.settings,
        client.subscription,
      )

      if (!lastFmUsername) {
        chatClient.say(
          channel,
          t('lastFmNotConfigured', { lng: client.locale }),
          message.user.messageId,
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
      if (!tracks || !tracks.length) {
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
          url: '', // dont show the url
          artist: artist || 'Unknown',
          title: title || 'Unknown',
          album: albumText ? ` [${albumText}]` : '',
          lng: client.locale,
          interpolation: { escapeValue: false },
        }),
        message.user.messageId,
      )
    } catch (error) {
      console.error('Error fetching Last.fm data:', error)
      chatClient.say(channel, t('songError', { lng: client.locale }), message.user.messageId)
    }
  },
})
