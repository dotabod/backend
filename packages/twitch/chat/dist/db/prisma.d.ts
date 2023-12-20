import { PrismaClient as PrismaPsql } from '@dotabod/prisma/dist/psql/index.js';
declare global {
    var prisma: PrismaPsql | undefined;
}
export declare const prisma: PrismaPsql<import("@dotabod/prisma/dist/psql/index.js").Prisma.PrismaClientOptions, never, import("@dotabod/prisma/dist/psql/runtime/library").DefaultArgs>;
//# sourceMappingURL=prisma.d.ts.map