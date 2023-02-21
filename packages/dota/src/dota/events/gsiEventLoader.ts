import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type GSIEventsMap = Record<string, any>
const gsiEvents: GSIEventsMap = {}

fs.readdirSync(path.resolve(__dirname, 'gsi-events')).forEach((file) => {
  if (file.endsWith('.js') || file.endsWith('.ts')) {
    const gsiEvent = import(`./gsi-events/${file}`)
    gsiEvents[file.slice(0, -3)] = gsiEvent
  }
})

export default gsiEvents
