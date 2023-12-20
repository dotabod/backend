import { Db, MongoClient } from 'mongodb';
declare class MongoDBSingleton {
    clientPromise: Promise<Db> | null;
    mongoClient: MongoClient | null;
    connect(): Promise<Db>;
    close(): Promise<void>;
}
declare const _default: MongoDBSingleton;
export default _default;
//# sourceMappingURL=MongoDBSingleton.d.ts.map