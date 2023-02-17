import fs from 'fs'
import path from 'path'

type GSIEventsMap = Record<string, any>
const gsiEvents: GSIEventsMap = {}

fs.readdirSync(path.resolve('src', 'dota', 'events', 'gsi-events')).forEach((file) => {
  if (file.endsWith('.js') || file.endsWith('.ts')) {
    const gsiEvent = import(`./gsi-events/${file}`)
    gsiEvents[file.slice(0, -3)] = gsiEvent
  }
})

export default gsiEvents
