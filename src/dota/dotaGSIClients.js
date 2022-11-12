import { socketClients } from './trackingConsts.js'

// Return: { name: string, token: string, sockets: [], gsi: {} }
function findUser(token) {
  if (!token) return null

  const user = socketClients.findIndex((client) => client.token === token)
  if (user === -1) return null

  // if (!socketClients[user].gsi) {
  // const gsi = gsiClients.find((client) => client.token === token)
  // if (gsi) {
  // socketClients[user].gsi = gsi
  // console.log('added to gsi')
  // }
  // }

  return socketClients[user]
}

export default findUser
