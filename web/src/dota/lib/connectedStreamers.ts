import { gsiClients } from './consts.js'

function findUser(token?: string) {
  if (!token) return null

  const user = gsiClients.findIndex((client) => client.token === token)
  if (user === -1) return null

  return gsiClients[user]
}

export function findUserByTwitchId(twitchId: string) {
  if (!twitchId) return null

  const user = gsiClients.findIndex((client) => client.Account?.providerAccountId === twitchId)
  if (user === -1) return null

  return gsiClients[user]
}

export function findUserByName(name: string) {
  if (!name) return null

  const user = gsiClients.findIndex((client) => client.name.toLowerCase() === name.toLowerCase())
  if (user === -1) return null

  return gsiClients[user]
}

export default findUser
