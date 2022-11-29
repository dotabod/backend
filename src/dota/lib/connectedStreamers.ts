import { socketClients } from './consts'

function findUser(token: string) {
  if (!token) return null

  const user = socketClients.findIndex((client) => client.token === token)
  if (user === -1) return null

  return socketClients[user]
}

export function findUserByTwitchId(twitchId: string) {
  if (!twitchId) return null

  const user = socketClients.findIndex((client) => client.Account?.providerAccountId === twitchId)
  if (user === -1) return null

  return socketClients[user]
}

export function findUserByName(name: string) {
  if (!name) return null

  const user = socketClients.findIndex((client) => client.name.toLowerCase() === name.toLowerCase())
  if (user === -1) return null

  return socketClients[user]
}

// This will update often
export function getActiveUsers() {
  return socketClients.filter((client) => client.sockets.length > 0 && client.gsi)
}

export default findUser
