import { getAppToken } from '@twurple/auth'

let cachedHeaders: Record<string, string> | null = null

export async function getTwitchHeaders(): Promise<Record<string, string>> {
  if (cachedHeaders) {
    return cachedHeaders
  }

  const appToken = await getAppToken(
    process.env.TWITCH_CLIENT_ID || '',
    process.env.TWITCH_CLIENT_SECRET || '',
  )

  cachedHeaders = {
    'Client-Id': process.env.TWITCH_CLIENT_ID || '',
    Authorization: `Bearer ${appToken?.accessToken}`,
    Accept: 'application/json',
    'Accept-Encoding': 'gzip',
  }

  return cachedHeaders
}
