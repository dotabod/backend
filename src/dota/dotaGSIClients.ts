import { socketClients } from './trackingConsts'

// Return: { name: string, token: string, sockets: [], gsi: {} }
function findUser(token) {
  if (!token) return null

  const user = socketClients.findIndex((client) => client.token === token)
  if (user === -1) return null

  return socketClients[user]
}

export default findUser
