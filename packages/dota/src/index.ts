process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

function initServer() {
  Promise.all([import('./dota/index'), import('./twitch/index')])
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
