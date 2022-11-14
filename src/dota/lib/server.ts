import supabase from '../../db/supabase'
import findUser from '../dotaGSIClients'
import { socketClients } from '../trackingConsts'
import D2GSI from './dota2-gsi'

const server = new D2GSI()

// No main page
server.app.get('/', (req, res) => {
  res.status(401).json({
    error: new Error('Invalid request!'),
  })
})

// IO auth & client setup so we can send this socket messages
server.io.use(async (socket, next) => {
  const { token } = socket.handshake.auth
  const connectedSocketClient = findUser(token)

  // Cache to prevent a supabase lookup on every message for username & token validation
  if (connectedSocketClient) {
    // eslint-disable-next-line no-param-reassign
    socket.data = connectedSocketClient
    connectedSocketClient.sockets.push(socket.id)
    return next()
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('name')
    .eq('id', token)
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    return next(new Error('authentication error'))
  }

  // eslint-disable-next-line no-param-reassign
  socket.data.name = user.name
  // eslint-disable-next-line no-param-reassign
  socket.data.token = token
  // In case the socket is connected before the GSI client has!
  socketClients.push({ ...user, token, sockets: [socket.id] })

  return next()
})

// Cleanup the memory cache of sockets when they disconnect
server.io.on('connection', (socket) => {
  // Socket connected event, used to connect GSI to a socket
  const connectedSocketClient = findUser(socket.data.token)
  server.events.emit('new-socket-client', { client: connectedSocketClient, socketId: socket.id })

  socket.on('disconnect', () => {
    if (connectedSocketClient) {
      connectedSocketClient.sockets = connectedSocketClient.sockets.filter(
        (socketid) => socketid !== socket.id,
      )

      // Let's also remove all the events we setup from the client for this socket
      // That way a new socket will get the GSI events again
      if (!connectedSocketClient.sockets.length) {
        console.log(
          'No more sockets connected, removing all events for',
          connectedSocketClient.token,
        )
        // There's no socket connected so let's remove all GSI events
        connectedSocketClient.gsi?.removeAllListeners()
      }
    }
  })
})

export default server
