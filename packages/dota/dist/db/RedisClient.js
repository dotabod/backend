import { createClient } from 'redis';
import { logger } from '../utils/logger.js';
class RedisClient {
    static instance;
    client;
    subscriber;
    constructor() {
        this.client = createClient({ url: 'redis://redis:6379' });
        this.subscriber = this.client.duplicate();
    }
    async connect(connection) {
        try {
            await connection.connect();
            return connection;
        }
        catch (error) {
            logger.error('REDIS CONNECT ERR', { error });
            throw error;
        }
    }
    connectClient() {
        return this.connect(this.client);
    }
    connectSubscriber() {
        return this.connect(this.subscriber);
    }
    static getInstance() {
        if (!RedisClient.instance)
            RedisClient.instance = new RedisClient();
        return RedisClient.instance;
    }
}
export default RedisClient;
//# sourceMappingURL=RedisClient.js.map