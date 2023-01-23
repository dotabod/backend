import { EventSubUserUpdateEvent } from '@twurple/eventsub-base'

import { prisma } from '../../db/prisma.js'

export function updateUserEvent(e: EventSubUserUpdateEvent) {
  console.log(`${e.userId} updateUserEvent`)

  prisma.account
    .update({
      data: {
        user: {
          update: {
            name: e.userName,
            displayName: e.userDisplayName,
            email: e.userEmail,
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
    .then(() => {
      console.log('updateUserEvent event', e.userId)
    })
    .catch((e) => {
      console.error(e, 'updateUserEvent error', e.userId)
    })
}
