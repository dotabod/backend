export function initServer() {
  Promise.all([
    import('./dota/index.js'),
    import('./twitch/index.js'),
    import('./twitch/events.js'),
  ])
    .then(() => {
      // All imports are now loaded
      console.log('Modules loaded')
    })
    .catch((e) => {
      console.error('Error during setup:', e)
    })
  // ... any other setup you might need
}

initServer()
