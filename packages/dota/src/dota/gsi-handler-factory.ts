import type { SocketClient } from '../types'
import type { GSIHandlerType } from './gsi-handler-types'

// This is a placeholder for now - the actual implementation will be set at runtime
let GSIHandlerConstructor: (client: SocketClient) => GSIHandlerType = () => {
  throw new Error('GSIHandlerConstructor not initialized')
}

export const setGSIHandlerConstructor = function setGSIHandlerConstructor(
  ctor: (client: SocketClient) => GSIHandlerType
): void {
  GSIHandlerConstructor = ctor
}

export const createGSIHandler = function createGSIHandler(client: SocketClient): GSIHandlerType {
  return GSIHandlerConstructor(client)
}
