import { PrismaClient as PrismaPsql } from '@dotabod/prisma/dist/psql/index.js';
export const prisma = global.prisma ?? new PrismaPsql();
if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
}
//# sourceMappingURL=prisma.js.map