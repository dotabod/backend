import isEqual from 'lodash.isequal'

import { server } from '../../index.js'

export class DataBroadcaster {
  status: any = { active: false }
  lastUpdate = 0
  minimap: Record<string, any> = {
    heroes: {
      data: [],
      lastUpdate: 0,
      timeout: 500,
    },
    hero_units: {
      data: [],
      lastUpdate: 0,
      timeout: 500,
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
    buildings: {
      data: [],
      lastUpdate: 0,
      timeout: 2000,
    },
    tp: {
      data: [],
      lastUpdate: 0,
      timeout: 500,
    },
    scan: {
      data: [],
      lastUpdate: 0,
      timeout: 500,
    },
  }

  sendData(parsedData: any, token: string) {
    // Update Status
    this.status = parsedData.status

    // Update Data
    if (parsedData.minimap) {
      Object.keys(this.minimap).forEach((type) => {
        const entity = this.minimap[type]
        const elapsedTime = Date.now() - entity.lastUpdate
        const emitFlag =
          !isEqual(entity.data, parsedData.minimap[type]) && elapsedTime >= entity.timeout

        if (emitFlag) {
          entity.data = parsedData.minimap[type]
          entity.lastUpdate = Date.now()
          server.io.to(token).emit(`DATA_${type}`, entity.data)
          // this.logger.info(`Broadcast: ${type}`)
        }
      })
    }

    // Set timestamp
    this.lastUpdate = Date.now()
  }
}
