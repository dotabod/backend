import express from 'express'
import bodyParser from 'body-parser'
import http from 'http'
import { Server } from 'socket.io'

import supabase from '../db/supabase.js'

const app = express()
const httpServer = http.createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
  },
})

app.set('socketio', io)

function emitAll(prefix, obj, socketid) {
  Object.keys(obj).forEach((key) => {
    // For scanning keys and testing
    // emitter.emit("key", ""+prefix+key);
    // console.log("Emitting '"+prefix+key+"' - " + obj[key]);
    io.to(socketid).emit(prefix + key, obj[key])
  })
}

function recursiveEmit(prefix, changed, body, socketid) {
  Object.keys(changed).forEach((key) => {
    if (typeof changed[key] === 'object') {
      if (body[key] != null) {
        // safety check
        recursiveEmit(`${prefix + key}:`, changed[key], body[key], socketid)
      }
    } else if (body[key] != null) {
      // Got a key
      if (typeof body[key] === 'object') {
        // Edge case on added:item/ability:x where added shows true at the top level
        // and doesn't contain each of the child keys
        emitAll(`${prefix + key}:`, body[key], socketid)
      } else {
        // For scanning keys and testing
        // emitter.emit("key", ""+prefix+key);
        // console.log("Emitting '"+prefix+key+"' - " + body[key]);
        io.to(socketid).emit(prefix + key, body[key])
      }
    }
  })
}

function processChanges(section) {
  return function handle(req, res, next) {
    if (req.body[section]) {
      // console.log("Starting recursive emit for '" + section + "'");
      recursiveEmit('', req.body[section], req.body, req.client.socketid)
    }
    next()
  }
}

function updateGamestate(req, res, next) {
  req.client.gamestate = req.body
  next()
}

function newData(req, res, next) {
  io.to(req.client.socketid).emit('state', req.body?.map?.game_state || 'DISCONNECTED')
  res.end()
}

const dotaGSIClients = []
async function checkAuth(req, res, next) {
  // Sent from dota gsi config file
  const token = req.body?.auth?.token

  const foundUser = dotaGSIClients.findIndex((client) => client.token === token)
  if (foundUser !== -1) {
    req.client.name = dotaGSIClients[foundUser].name
    req.client.socketid = dotaGSIClients[foundUser].socketid
    req.client.token = token

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
      req.client.name = user.name
      req.client.token = token
      dotaGSIClients.push({ ...user, token })
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
app.get('/', (req, res, next) => {
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

  // Get latest twitch access token that isn't expired
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
  socket.user = user
  // eslint-disable-next-line no-param-reassign
  socket.user.token = token

  const connectedGSIClient = dotaGSIClients.findIndex((client) => client.token === token)
  if (connectedGSIClient !== -1) {
    dotaGSIClients[connectedGSIClient].socketid = socket.id
  }

  return next()
})

io.on('map:clock_time', (time) => {
  console.log(time)
})

io.on('connection', (socket) => {
  console.log('a user connected: ', socket.user.name, socket.id)
})
