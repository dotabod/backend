import SegfaultHandler from 'segfault-handler'

SegfaultHandler.registerHandler('crash.log', function (signal, address, stack) {
  // Do what you want with the signal, address, or stack (array)
  // This callback will execute before the signal is forwarded on.

  console.log({ signal, address, stack })
})

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
