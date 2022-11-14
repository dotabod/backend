import { socketClients } from './trackingConsts'

// Return: { name: string, token: string, sockets: [], gsi: {} }
function findUser(token: string) {
  if (!token) return null

  const user = socketClients.findIndex((client) => client.token === token)
  if (user === -1) return null

  return socketClients[user]
}

// This will update often
export function getActiveUsers() {
  return socketClients.filter((client) => client.sockets.length > 0 && client.gsi)
}

export default findUser
