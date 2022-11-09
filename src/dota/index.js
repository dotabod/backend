import express from 'express'
import bodyParser from 'body-parser'
import http from 'http'
import { Server } from 'socket.io'

import supabase from '../db/supabase.js'

const app = express()
const httpServer = http.createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_URL_ALLOWED,
    methods: ['GET', 'POST'],
  },
})

function emitAll(prefix, obj, socketids) {
  Object.keys(obj).forEach((key) => {
    // For scanning keys and testing
    // emitter.emit("key", ""+prefix+key);
    // console.log("Emitting '"+prefix+key+"' - " + obj[key]);
    io.to(socketids).emit(prefix + key, obj[key])
  })
}

function recursiveEmit(prefix, changed, body, socketids) {
  Object.keys(changed).forEach((key) => {
    if (typeof changed[key] === 'object') {
      if (body[key] != null) {
        // safety check
        recursiveEmit(`${prefix + key}:`, changed[key], body[key], socketids)
      }
    } else if (body[key] != null) {
      // Got a key
      if (typeof body[key] === 'object') {
        // Edge case on added:item/ability:x where added shows true at the top level
        // and doesn't contain each of the child keys
        emitAll(`${prefix + key}:`, body[key], socketids)
      } else {
        // For scanning keys and testing
        // emitter.emit("key", ""+prefix+key);
        // console.log("Emitting '"+prefix+key+"' - " + body[key]);
        io.to(socketids).emit(prefix + key, body[key])
      }
    }
  })
}

function processChanges(section) {
  return function handle(req, res, next) {
    if (req.body[section]) {
      // console.log("Starting recursive emit for '" + section + "'");
      recursiveEmit('', req.body[section], req.body, req.client.socketinfo.sockets)
    }
    next()
  }
}

function updateGamestate(req, res, next) {
  req.client.gamestate = req.body
  next()
}

function newData(req, res) {
  io.to(req.client.socketinfo.sockets).emit('state', req.body?.map?.game_state || 'DISCONNECTED')
  res.end()
}

const dotaGSIClients = []
async function checkAuth(req, res, next) {
  if (req?.body?.player?.team_name === 'spectator') {
    res.status(401).json({
      error: new Error('Invalid request!'),
    })
    return
  }

  // Sent from dota gsi config file
  const token = req.body?.auth?.token

  const foundUser = dotaGSIClients.findIndex((client) => client.token === token)
  if (foundUser !== -1) {
    req.client.socketinfo = dotaGSIClients[foundUser]
    next()
    return
  }

  if (token) {
    const { data: user, error } = await supabase
      .from('users')
      .select('name')
      .eq('id', token)
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (!error) {
      req.client.socketinfo = {
        name: user.name,
        token,
      }

      // sockets[] to be filled in by socket connection
      dotaGSIClients.push({ ...user, token, sockets: [] })
      next()
      return
    }
  }

  console.log(`Dropping message from IP: ${req.ip}, no valid auth token`)
  res.status(401).json({
    error: new Error('Invalid request!'),
  })
}

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.post(
  '/gsi',
  checkAuth,
  updateGamestate,
  processChanges('previously'),
  processChanges('added'),
  newData,
)

// No main page
app.get('/', (req, res) => {
  res.status(401).json({
    error: new Error('Invalid request!'),
  })
})

httpServer.listen(3000, () => {
  console.log('listening on *:3000')
})

/// IO
io.use(async (socket, next) => {
  const { token } = socket.handshake.auth
  const connectedGSIClient = dotaGSIClients.findIndex((client) => client.token === token)

  // Cache to prevent a supabase lookup on every message for username & token validation
  if (connectedGSIClient !== -1) {
    // eslint-disable-next-line no-param-reassign
    socket.data = dotaGSIClients[connectedGSIClient]
    dotaGSIClients[connectedGSIClient].sockets.push(socket.id)
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

  return next()
})

io.on('connection', (socket) => {
  console.log('a user connected: ', socket.data.name, socket.id)

  socket.on('disconnect', () => {
    console.log('a user disconnected: ', socket.data.name, socket.id)

    const connectedGSIClient = dotaGSIClients.findIndex(
      (client) => client.token === socket.data.token,
    )
    if (connectedGSIClient !== -1) {
      dotaGSIClients[connectedGSIClient].sockets = dotaGSIClients[
        connectedGSIClient
      ].sockets.filter((socketid) => socketid !== socket.id)
    }
  })
})
