import { t } from 'i18next'
import { DBSettings, getValueOrDefault } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

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

      // Send the song information to chat
      chatClient.say(
        channel,
        t('currentSong', {
          url: '', // dont show the url
          artist: recentTrack.artist['#text'] || 'Unknown',
          title: recentTrack.name || 'Unknown',
          album: recentTrack.album['#text'] ? ` [${recentTrack.album['#text']}]` : '',
          lng: client.locale,
        }),
        message.user.messageId,
      )
    } catch (error) {
      console.error('Error fetching Last.fm data:', error)
      chatClient.say(channel, t('songError', { lng: client.locale }), message.user.messageId)
    }
  },
})
