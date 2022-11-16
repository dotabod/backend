import prisma from './prisma'

export async function getDBUser(token: string) {
  // Finding `account` because `user` is required there
  // But if we find `user`, `account` is optional? Idk why, something schema maybe
  const account = await prisma.account.findFirst({
    select: {
      refresh_token: true,
      access_token: true,
      providerAccountId: true,
      user: {
        select: {
          id: true,
          mmr: true,
          playerId: true,
          name: true,
        },
      },
    },
    where: {
      user: {
        id: token,
      },
    },
  })

  return !account
    ? null
    : {
        ...account.user,
        account: {
          refresh_token: account.refresh_token,
          access_token: account.access_token,
          providerAccountId: account.providerAccountId,
        },
      }
}
