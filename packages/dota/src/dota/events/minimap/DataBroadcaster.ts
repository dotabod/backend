import isEqual from 'lodash.isequal'

import { server } from '../../index.js'

export class DataBroadcaster {
  token: string
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

  constructor(token: string) {
    this.token = token
  }

  sendInitialData() {
    Object.keys(this.minimap).forEach((type) => {
      const entity = this.minimap[type]
      entity.lastUpdate = Date.now()
      server.io.to(this.token).emit(`DATA_${type}`, entity.data)
    })
  }

  resetData() {
    Object.keys(this.minimap).forEach((type) => {
      const entity = this.minimap[type]
      entity.data = []
      entity.lastUpdate = 0
    })
  }

  // called every gametick
  sendData(parsedData: any) {
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
          if (!this.lastUpdate) {
            this.lastUpdate = 0
          }

          // check if the last update time for the token is greater than the entity's last update time
          if (this.lastUpdate < entity.lastUpdate) {
            server.io.to(this.token).emit(`DATA_${type}`, entity.data)
            this.lastUpdate = entity.lastUpdate
          }
        }
      })
    }
  }
}
