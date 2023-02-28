import { EventSubUserUpdateEvent } from '@twurple/eventsub-base'

import { prisma } from '../../db/prisma.js'

export async function updateUserEvent(e: EventSubUserUpdateEvent) {
  console.log(`${e.userId} updateUserEvent`)
  try {
    const streamer = await e.getUser()

    const data = {
      name: e.userName,
      displayName: e.userDisplayName,
      email: e.userEmail,
      image: streamer.profilePictureUrl,
    }

    // remove falsy values from data (like displayName: undefined)
    const filteredData = Object.fromEntries(
      Object.entries(data).filter(([key, value]) => Boolean(value)),
    )

    await prisma.account.update({
      data: {
        user: {
          update: filteredData,
        },
      },
      where: {
        provider_providerAccountId: {
          provider: 'twitch',
          providerAccountId: e.userId,
        },
      },
    })
  } catch (err) {
    console.error(err, 'updateUserEvent error', e.userId)
  }
}
