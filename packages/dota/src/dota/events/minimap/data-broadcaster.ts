import isEqual from 'lodash.isequal'

import { server } from '../../server'
import type {
  DataBroadcasterInterface,
  EntityData,
  MinimapData,
  MinimapEntityType,
  ParsedData,
} from './data-broadcaster-types'

const DEFAULT_DATA: MinimapData = {
  buildings: {
    data: [],
    lastUpdate: 0,
    timeout: 2000,
  },
  couriers: {
    data: [],
    lastUpdate: 0,
    timeout: 500,
  },
  creeps: {
    data: [],
    lastUpdate: 0,
    timeout: 1000,
  },
  hero_units: {
    data: [],
    lastUpdate: 0,
    timeout: 500,
  },
  heroes: {
    data: [],
    lastUpdate: 0,
    timeout: 500,
  },
  scan: {
    data: [],
    lastUpdate: 0,
    timeout: 500,
  },
  tp: {
    data: [],
    lastUpdate: 0,
    timeout: 500,
  },
}

export const sendInitialData = function sendInitialData(token: string) {
  const KEYS = Object.keys(DEFAULT_DATA) as MinimapEntityType[]
  KEYS.forEach((type) => {
    const entity = DEFAULT_DATA[type]
    entity.lastUpdate = Date.now()
    server.io.to(token).emit(`DATA_${type}`, entity.data)
  })
}

export class DataBroadcaster implements DataBroadcasterInterface {
  token: string
  minimap: MinimapData = DEFAULT_DATA

  constructor(token: string) {
    this.token = token
  }

  resetData(): void {
    Object.keys(this.minimap).forEach((type) => {
      const entity = this.minimap[type as MinimapEntityType]
      entity.data = []
      entity.lastUpdate = 0
    })
  }

  // called every gametick
  sendData(parsedData: ParsedData): void {
    // Update Data
    if (parsedData.minimap) {
      Object.keys(this.minimap).forEach((type) => {
        const entity = this.minimap[type as MinimapEntityType]
        const elapsedTime = Date.now() - entity.lastUpdate
        const minimapData = parsedData.minimap?.[type as MinimapEntityType]
        const emitFlag =
          minimapData !== undefined &&
          !isEqual(entity.data, minimapData) &&
          elapsedTime >= entity.timeout

        if (emitFlag) {
          entity.data = minimapData
          entity.lastUpdate = Date.now()
          server.io.to(this.token).emit(`DATA_${type}`, entity.data)
        }
      })
    }
  }
}
