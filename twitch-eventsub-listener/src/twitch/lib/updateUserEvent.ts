import { EventSubUserUpdateEvent } from '@twurple/eventsub-base'

import { prisma } from '../../db/prisma.js'

export async function updateUserEvent(e: EventSubUserUpdateEvent) {
  console.log(`${e.userId} updateUserEvent`)
  try {
    const streamer = await e.getUser()

    await prisma.account.update({
      data: {
        user: {
          update: {
            name: e.userName,
            displayName: e.userDisplayName,
            email: e.userEmail,
            image: streamer.profilePictureUrl,
          },
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
