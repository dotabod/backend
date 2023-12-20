import isEqual from 'lodash.isequal';
import { server } from '../../index.js';
const DEFAULT_DATA = {
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
};
export function sendInitialData(token) {
    const KEYS = Object.keys(DEFAULT_DATA);
    KEYS.forEach((type) => {
        const entity = DEFAULT_DATA[type];
        entity.lastUpdate = Date.now();
        server.io.to(token).emit(`DATA_${type}`, entity.data);
    });
}
export class DataBroadcaster {
    token;
    minimap = DEFAULT_DATA;
    constructor(token) {
        this.token = token;
    }
    resetData() {
        Object.keys(this.minimap).forEach((type) => {
            const entity = this.minimap[type];
            entity.data = [];
            entity.lastUpdate = 0;
        });
    }
    // called every gametick
    sendData(parsedData) {
        // Update Data
        if (parsedData.minimap) {
            Object.keys(this.minimap).forEach((type) => {
                const entity = this.minimap[type];
                const elapsedTime = Date.now() - entity.lastUpdate;
                const emitFlag = !isEqual(entity.data, parsedData.minimap[type]) && elapsedTime >= entity.timeout;
                if (emitFlag) {
                    entity.data = parsedData.minimap[type];
                    entity.lastUpdate = Date.now();
                    server.io.to(this.token).emit(`DATA_${type}`, entity.data);
                }
            });
        }
    }
}
//# sourceMappingURL=DataBroadcaster.js.map