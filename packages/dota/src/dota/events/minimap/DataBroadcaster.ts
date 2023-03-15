import isEqual from 'lodash.isequal'

import { server } from '../../index.js'

export class DataBroadcaster {
  lastUpdateByToken: Record<string, number> = {} // stores the last update time per token
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

  // called every gametick
  sendData(parsedData: any, token: string) {
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

          // check if the token has a last update time
          if (!this.lastUpdateByToken[token]) {
            this.lastUpdateByToken[token] = 0
          }

          // check if the last update time for the token is greater than the entity's last update time
          if (this.lastUpdateByToken[token] < entity.lastUpdate) {
            server.io.to(token).emit(`DATA_${type}`, entity.data)
            this.lastUpdateByToken[token] = entity.lastUpdate
          }
        }
      })
    }
  }
}
