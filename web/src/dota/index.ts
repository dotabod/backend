import './events/gsiEventLoader.js'

import { GSIHandler } from './GSIHandler.js'
import GSIServer from './GSIServer.js'

// Then setup the dota gsi server & websocket server
export const server = new GSIServer()

export const gsiHandlers = new Map<string, GSIHandler>()
export const twitchIdToToken = new Map<string, string>()
