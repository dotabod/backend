export function initServer() {
  import('./dota/index.js')
  import('./twitch/index.js')
  import('./twitch/events.js')
  // ... any other setup you might need
}

console.log('geczy', process.env.NODE_ENV)
initServer()
