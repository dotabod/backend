import { moderateText } from '@dotabod/profanity-filter'
import { t } from 'i18next'
import { z } from 'zod'

import { DBSettings, getValueOrDefault } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

// Last.fm's JSON API returns track/artist/album names with HTML-encoded entities
// (e.g. "&#39;" for "'", "&amp;" for "&"). Twitch chat doesn't render HTML, so
// we decode the common entities before emitting.
const decodeHtmlEntities = (s: string): string =>
  s
    .replaceAll(/&#(?<decimalCode>\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll(/&#x(?<hexCode>[0-9a-fA-F]+);/gu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

const lastFmTrackSchema = z.object({
  '@attr': z.object({ nowplaying: z.string() }).optional(),
  album: z.object({ '#text': z.string() }),
  artist: z.object({ '#text': z.string() }),
  name: z.string(),
})

const lastFmResponseSchema = z.object({
  recenttracks: z.object({
    track: z.array(lastFmTrackSchema),
  }),
})

type LastFmTrack = z.infer<typeof lastFmTrackSchema>

const getRecentTrack = async function getRecentTrack(
  lastFmUsername: string,
  apiKey: string
): Promise<LastFmTrack | null> {
  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${lastFmUsername}&api_key=${apiKey}&format=json&limit=1`
  const response = await fetch(url)
  const payload: unknown = await response.json()
  const parsedResponse = lastFmResponseSchema.parse(payload)
  return parsedResponse.recenttracks.track.at(0) ?? null
}

const withFallback = function withFallback(value: string | undefined, fallback: string): string {
  return value !== undefined && value.length > 0 ? value : fallback
}

const getModeratedTrack = async function getModeratedTrack(track: LastFmTrack): Promise<{
  album: string
  artist: string
  title: string
}> {
  const [artist, title, album] = await Promise.all([
    moderateText(decodeHtmlEntities(withFallback(track.artist['#text'], 'Unknown'))),
    moderateText(decodeHtmlEntities(withFallback(track.name, 'Unknown'))),
    moderateText(decodeHtmlEntities(track.album['#text'])),
  ])
  return {
    album: album !== undefined && album.length > 0 ? ` [${album}]` : '',
    artist: withFallback(artist, 'Unknown'),
    title: withFallback(title, 'Unknown'),
  }
}

commandHandler.registerCommand('song', {
  aliases: ['lastfm', 'music', 'nowplaying'],
  dbkey: DBSettings.commandLastFm,
  handler: async (message: MessageType) => {
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

      if (lastFmUsername === null || lastFmUsername === undefined || lastFmUsername.length === 0) {
        chatClient.say(
          channel,
          t('lastFmNotConfigured', { lng: client.locale }),
          message.user.messageId
        )
        return
      }

      // Call the Last.fm API to get the current song
      const apiKey = process.env.LASTFM_API_KEY
      if (apiKey === undefined || apiKey.length === 0) {
        chatClient.say(channel, t('songError', { lng: client.locale }), message.user.messageId)
        return
      }

      const recentTrack = await getRecentTrack(lastFmUsername, apiKey)
      if (recentTrack === null) {
        chatClient.say(channel, t('songNotPlaying', { lng: client.locale }), message.user.messageId)
        return
      }

      const isNowPlaying = recentTrack['@attr']?.nowplaying === 'true'

      if (!isNowPlaying) {
        chatClient.say(channel, t('songNotPlaying', { lng: client.locale }), message.user.messageId)
        return
      }

      const track = await getModeratedTrack(recentTrack)

      // Twitch chat isn't HTML, so disable i18next's default HTML-escape —
      // otherwise the decoded apostrophes get re-encoded back to "&#39;".
      chatClient.say(
        channel,
        t('currentSong', {
          album: track.album,
          artist: track.artist,
          interpolation: { escapeValue: false },
          lng: client.locale,
          title: track.title,
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
