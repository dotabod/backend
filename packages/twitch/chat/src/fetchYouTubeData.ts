import { google } from 'googleapis'

/**
 * Fetches the liveChatId for the current live broadcast.
 * @param {string} accessToken The access token of the authenticated user.
 * @returns {Promise<string | null>} The liveChatId or null if not found.
 */
async function fetchLiveChatId(accessToken: string, refreshToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI,
  )
  auth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  const youtube = google.youtube({
    version: 'v3',
    auth,
  })

  try {
    const response = await youtube.liveBroadcasts.list({
      part: ['snippet'],
      broadcastType: 'all',
      mine: true,
    })

    const broadcasts = response.data.items
    if (broadcasts && broadcasts.length > 0) {
      // Assuming the first broadcast is the one we're interested in
      const { liveChatId } = broadcasts[0].snippet || {}
      return liveChatId
    }
    return null
  } catch (error) {
    console.error('Error fetching liveChatId:', error)
    return null
  }
}

export default fetchLiveChatId
