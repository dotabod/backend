import { prisma } from '../../db/prisma.js'

export async function getBotTokens() {
  return await prisma.account.findFirst({
    select: {
      refresh_token: true,
      access_token: true,
      expires_in: true,
      scope: true,
      obtainment_timestamp: true,
    },
    where: {
      provider: 'twitch',
      providerAccountId: process.env.TWITCH_BOT_PROVIDERID,
    },
  })
}
