import type { SocketClient } from '../types.js'
import type { GSIHandlerType } from './GSIHandlerTypes.js'

// This is a placeholder for now - the actual implementation will be set at runtime
let GSIHandlerConstructor: (client: SocketClient) => GSIHandlerType = () => {
  throw new Error('GSIHandlerConstructor not initialized')
}

export function setGSIHandlerConstructor(ctor: (client: SocketClient) => GSIHandlerType): void {
  GSIHandlerConstructor = ctor
}

export function createGSIHandler(client: SocketClient): GSIHandlerType {
  return GSIHandlerConstructor(client)
}
