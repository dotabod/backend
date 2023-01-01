import fs from 'fs'
import path from 'path'

type GSIEventsMap = Record<string, any>
const gsiEvents: GSIEventsMap = {}

const dirname = path.dirname(new URL(import.meta.url).pathname)
fs.readdirSync(path.join(dirname, './gsi-events')).forEach((file) => {
  if (file.endsWith('.js') || file.endsWith('.ts')) {
    const gsiEvent = import(`./gsi-events/${file}`)
    gsiEvents[file.slice(0, -3)] = gsiEvent
  }
})

export default gsiEvents
